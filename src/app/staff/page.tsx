import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { staffPage } from "@/lib/auth";
import { WaiterApp } from "./waiter-app";

export const metadata: Metadata = { title: "Waiter" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const staff = await staffPage(["WAITER"]);
  const { tab } = await searchParams;
  return (
    <Providers>
      <WaiterApp me={staff} initialTab={typeof tab === "string" ? tab : undefined} />
    </Providers>
  );
}
