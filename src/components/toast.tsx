"use client";

import { BellRing, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "error" | "info" | "ping";
type Toast = { id: number; tone: ToastTone; title: string; body?: string; onClick?: () => void };

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "ping" ? 8000 : t.tone === "error" ? 6000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : t.tone === "error" ? CircleAlert : t.tone === "ping" ? BellRing : Info;
          return (
            <div
              key={t.id}
              role="status"
              onClick={() => {
                t.onClick?.();
                dismiss(t.id);
              }}
              className={cn(
                "pointer-events-auto flex w-full max-w-md cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1 animate-pop",
                t.tone === "success" && "bg-moss-50 text-moss-700 ring-moss-100",
                t.tone === "error" && "bg-red-50 text-red-900 ring-red-200",
                t.tone === "info" && "bg-white text-ink-900 ring-linen-300",
                t.tone === "ping" && "bg-ink-900 text-white ring-brand-500/40",
              )}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", t.tone === "ping" && "text-gold-400")} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">{t.title}</p>
                {t.body ? <p className="mt-0.5 text-sm opacity-80">{t.body}</p> : null}
              </div>
              <button
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                className="opacity-60"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
