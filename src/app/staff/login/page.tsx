import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { currentStaff, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Staff login" };

export default async function LoginPage({ searchParams }: PageProps<"/staff/login">) {
  const staff = await currentStaff();
  if (staff) redirect(homeFor(staff.role));
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ink-900 px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/staff-chandelier.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
      <div className="absolute inset-0 bg-linear-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
      <div className="relative mb-8 text-center">
        <Wordmark className="text-[16px]" />
        <p className="mt-6 font-display text-2xl text-linen-50">Staff sign in</p>
        <p className="mt-1 text-sm text-linen-400">Waiters · kitchen & bar · managers</p>
      </div>
      <div className="relative w-full max-w-xs">
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
