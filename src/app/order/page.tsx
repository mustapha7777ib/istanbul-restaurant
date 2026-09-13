import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { GuestApp } from "./guest-app";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ searchParams }: PageProps<"/order">) {
  const { error } = await searchParams;
  return (
    <Providers>
      <GuestApp error={typeof error === "string" ? error : undefined} />
    </Providers>
  );
}
