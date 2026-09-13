"use client";

import { useEffect, useState } from "react";

/** Re-renders every `ms` so elapsed-time labels stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function elapsed(from: string | Date | null | undefined, now: number) {
  if (!from) return "";
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function minutesSince(from: string | Date | null | undefined, now: number) {
  if (!from) return 0;
  return (now - new Date(from).getTime()) / 60000;
}
