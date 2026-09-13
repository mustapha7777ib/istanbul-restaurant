import { cn } from "@/lib/cn";

/**
 * The Istanbul wordmark, after their logo: flared Marcellus capitals over a hairline and
 * "Cafe & Restaurant" set wide. Ivory and gold on dark backgrounds, logo crimson on light.
 */
export function Wordmark({ className, sub = true, tone = "light" }: { className?: string; sub?: boolean; tone?: "light" | "dark" }) {
  return (
    <div className={cn("inline-block text-center leading-none", className)}>
      <p className={cn("font-display text-[1.9em] uppercase tracking-[0.06em]", tone === "light" ? "text-linen-50" : "text-brand-600")}>Istanbul</p>
      {sub ? (
        <p
          className={cn(
            "mt-[0.4em] border-t pt-[0.45em] pl-[0.3em] text-[0.5em] font-medium uppercase tracking-[0.3em]",
            tone === "light" ? "border-gold-300/45 text-gold-300" : "border-brand-600/35 text-brand-600",
          )}
        >
          Cafe &amp; Restaurant
        </p>
      ) : null}
    </div>
  );
}

/** A tulip, the flower of Istanbul. */
export function Tulip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 16" className={className} aria-hidden fill="currentColor">
      <path d="M6 9.6C3.2 9.6 1.6 7.7 1.6 5.1L1.8 2 4.2 4.1 6 .8l1.8 3.3L10.2 2l.2 3.1c0 2.6-1.6 4.5-4.4 4.5Z" />
      <path d="M5.5 9.4h1v6.1h-1z" />
      <path d="M5.8 13.6c-2-.2-3.1-1.5-3.5-2.9 1.8.2 3 1.2 3.5 2.9Zm.4-1c2-.2 3.1-1.5 3.5-2.9-1.8.2-3 1.2-3.5 2.9Z" />
    </svg>
  );
}

/** ——✿—— section divider, in gold like the frames around their windows. */
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-gold-500", className)} aria-hidden>
      <span className="h-px flex-1 bg-current opacity-40" />
      <Tulip className="h-3.5 w-auto" />
      <span className="h-px flex-1 bg-current opacity-40" />
    </div>
  );
}
