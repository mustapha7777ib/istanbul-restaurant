import type { Station } from "@/generated/prisma/client";
import type { StaffUser } from "@/lib/auth";
import { logEvent, staffActor } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { parseOptionGroups, type OptionGroup } from "@/lib/options";
import { Outbox, rooms } from "@/lib/realtime";
import { isManager } from "./common";

export const imageUrl = (id: string | null | undefined) => (id ? `/api/images/${id}` : null);

/** The menu guests see: active items, including sold-out ones (shown greyed out). */
export async function publicMenu() {
  const categories = await prisma.menuCategory.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  return categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        priceKobo: i.priceKobo,
        image: imageUrl(i.imageId),
        isAvailable: i.isAvailable,
        tags: i.tags,
        prepMinutes: i.prepMinutes,
        station: i.station,
        featured: i.featured,
        optionGroups: parseOptionGroups(i.optionGroups),
      })),
    }));
}

export type PublicMenu = Awaited<ReturnType<typeof publicMenu>>;

function requireManager(staff: StaffUser) {
  if (!isManager(staff)) throw forbidden("Only managers can change the menu");
}

export async function saveCategory(staff: StaffUser, input: { id?: string; name: string; sortOrder: number; active: boolean }) {
  requireManager(staff);
  const cat = await prisma.$transaction(async (tx) => {
    const data = { name: input.name.trim(), sortOrder: input.sortOrder, active: input.active };
    if (!data.name) throw badRequest("Category name is required");
    const saved = input.id
      ? await tx.menuCategory.update({ where: { id: input.id }, data })
      : await tx.menuCategory.create({ data });
    await logEvent(tx, staffActor(staff.id), "MENU_CATEGORY_SAVED", { type: "MenuCategory", id: saved.id }, {
      data: { ...data, created: !input.id },
    });
    return saved;
  });
  new Outbox().add([rooms.everyone], "menu", {}).flush();
  return cat;
}

export type MenuItemInput = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  priceKobo: number;
  station: Station;
  prepMinutes: number;
  tags: string[];
  sortOrder: number;
  isAvailable: boolean;
  active: boolean;
  featured: boolean;
  optionGroups: OptionGroup[];
  imageId?: string | null;
};

export async function saveMenuItem(staff: StaffUser, input: MenuItemInput) {
  requireManager(staff);
  if (!input.name.trim()) throw badRequest("Item name is required");
  if (!Number.isInteger(input.priceKobo) || input.priceKobo <= 0) throw badRequest("Price must be more than ₦0");
  const item = await prisma.$transaction(async (tx) => {
    const before = input.id ? await tx.menuItem.findUnique({ where: { id: input.id } }) : null;
    if (input.id && !before) throw notFound("Menu item not found");
    const data = {
      categoryId: input.categoryId,
      name: input.name.trim(),
      description: input.description.trim(),
      priceKobo: input.priceKobo,
      station: input.station,
      prepMinutes: Math.max(1, Math.min(120, Math.round(input.prepMinutes))),
      tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 6),
      sortOrder: input.sortOrder,
      isAvailable: input.isAvailable,
      active: input.active,
      featured: input.featured,
      optionGroups: parseOptionGroups(input.optionGroups),
      ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
    };
    const saved = input.id
      ? await tx.menuItem.update({ where: { id: input.id }, data })
      : await tx.menuItem.create({ data });
    await logEvent(tx, staffActor(staff.id), "MENU_ITEM_SAVED", { type: "MenuItem", id: saved.id }, {
      data: {
        name: saved.name,
        created: !before,
        ...(before && before.priceKobo !== saved.priceKobo ? { priceFromKobo: before.priceKobo, priceToKobo: saved.priceKobo } : {}),
      },
    });
    return saved;
  });
  new Outbox().add([rooms.everyone], "menu", {}).flush();
  return item;
}

const IMAGE_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
const MAX_IMAGE_BYTES = 1_500_000;

export async function saveImage(staff: StaffUser, bytes: Uint8Array, mime: string) {
  if (!isManager(staff)) throw forbidden();
  if (!IMAGE_TYPES.has(mime)) throw badRequest("Upload a JPEG, PNG or WebP image");
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest("Image is too large (max 1.5 MB)");
  const image = await prisma.image.create({ data: { bytes: Buffer.from(bytes), mime } });
  return image.id;
}
