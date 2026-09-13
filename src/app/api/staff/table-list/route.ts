import { handler } from "@/lib/api";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** All active tables with their current owner, for "Add order for guest". */
export const GET = handler(async () => {
  await requireStaff(["WAITER", "MANAGER", "ADMIN"]);
  const tables = await prisma.table.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: {
      sessions: {
        where: { status: { not: "CLOSED" } },
        select: { id: true, waiterId: true, waiter: { select: { name: true } } },
      },
    },
  });
  return {
    tables: tables.map((t) => ({
      id: t.id,
      label: t.label,
      area: t.area,
      sessionId: t.sessions[0]?.id ?? null,
      waiterId: t.sessions[0]?.waiterId ?? null,
      waiterName: t.sessions[0]?.waiter?.name ?? null,
    })),
  };
});
