import type { Metadata } from "next";
import { MANAGER_ROLES, requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseOptionGroups } from "@/lib/options";
import { PageBody, PageHeader } from "../page-header";
import { MenuManager } from "./menu-manager";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  await requireStaff(MANAGER_ROLES);
  const categories = await prisma.menuCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  const data = categories.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    active: c.active,
    items: c.items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      name: i.name,
      description: i.description,
      priceKobo: i.priceKobo,
      station: i.station,
      prepMinutes: i.prepMinutes,
      tags: i.tags,
      sortOrder: i.sortOrder,
      isAvailable: i.isAvailable,
      active: i.active,
      featured: i.featured,
      optionGroups: parseOptionGroups(i.optionGroups),
      imageId: i.imageId,
    })),
  }));
  return (
    <>
      <PageHeader title="Menu" description="Prices, photos, kitchen or bar routing, and what's available. Changes reach guests' phones instantly." />
      <PageBody>
        <MenuManager categories={data} />
      </PageBody>
    </>
  );
}
