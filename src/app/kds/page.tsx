import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { staffPage } from "@/lib/auth";
import { KitchenDisplay } from "./kitchen-display";

export const metadata: Metadata = { title: "Kitchen display" };

export default async function KdsPage({ searchParams }: PageProps<"/kds">) {
  const staff = await staffPage(["KITCHEN", "MANAGER", "ADMIN"]);
  const { station } = await searchParams;
  const initial = station === "BAR" || station === "KITCHEN" ? station : (staff.station ?? "KITCHEN");
  return (
    <Providers>
      <KitchenDisplay staff={{ name: staff.name, role: staff.role, station: staff.station }} initialStation={initial} />
    </Providers>
  );
}
