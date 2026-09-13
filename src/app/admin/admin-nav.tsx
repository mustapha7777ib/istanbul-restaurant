"use client";

import {
  BarChart3,
  ChefHat,
  History,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  QrCode,
  Receipt,
  Settings,
  Trophy,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/client/api";
import { Wordmark } from "@/components/brand";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/admin", label: "Live floor", icon: LayoutGrid },
  { href: "/admin/orders", label: "Orders & payments", icon: Receipt },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/awards", label: "Staff of the Month", icon: Trophy },
  { href: "/admin/shifts", label: "Shifts & cash", icon: Wallet },
  { href: "/admin/feedback", label: "Guest feedback", icon: MessageSquare },
  { href: "/admin/activity", label: "Activity log", icon: History },
  { href: "/admin/menu", label: "Menu", icon: Utensils },
  { href: "/admin/tables", label: "Tables & QR codes", icon: QrCode },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function AdminNav({ staff, restaurant }: { staff: { name: string; role: string }; restaurant: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {LINKS.filter((l) => !l.adminOnly || staff.role === "ADMIN").map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            isActive(l.href) ? "bg-white/[0.08] text-white shadow-[inset_3px_0_0_var(--color-brand-500)]" : "text-linen-300 hover:bg-white/5 hover:text-white",
          )}
        >
          <l.icon className="size-5" />
          {l.label}
        </Link>
      ))}
      <Link href="/kds" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-linen-400 hover:bg-white/5 hover:text-white">
        <ChefHat className="size-5" /> Kitchen screen
      </Link>
    </nav>
  );
  const footer = (
    <div className="border-t border-white/10 p-4">
      <p className="text-sm font-semibold text-white">{staff.name}</p>
      <p className="text-xs capitalize text-linen-400">{staff.role.toLowerCase()}</p>
      <button
        onClick={logout}
        className="mt-3 flex items-center gap-2 text-sm text-linen-400 hover:text-white"
      >
        <LogOut className="size-4" /> Log out
      </button>
    </div>
  );
  return (
    <>
      <div className="no-print sticky top-0 z-40 flex items-center justify-between bg-ink-900 px-4 py-3 text-white lg:hidden">
        <Wordmark className="text-[11px]" sub={false} />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 hover:bg-white/10">
          <Menu className="size-6" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink-900">
            <div className="flex items-center justify-between px-4 py-4">
              <p className="font-bold text-white">{restaurant}</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-linen-400">
                <X className="size-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {footer}
          </aside>
        </div>
      ) : null}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink-900 lg:flex">
        <div className="px-5 py-5">
          <Wordmark className="text-[14px]" sub={false} />
          <p className="eyebrow mt-2 text-[10px] text-gold-300">Manager&apos;s office</p>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </aside>
    </>
  );
}
