"use client";

import { Delete, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Input } from "@/components/ui";
import { hardNavigate, post } from "@/lib/client/api";

export function LoginForm({ next }: { next?: string }) {
  const [staffCode, setStaffCode] = useState("");
  const [secret, setSecret] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { home } = await post<{ home: string }>("/api/auth/login", { staffCode, secret });
      hardNavigate(next ?? home);
    } catch (err) {
      setError((err as Error).message);
      setSecret("");
      setLoading(false);
    }
  }

  const press = (d: string) => setSecret((s) => (s.length < 6 ? s + d : s));

  return (
    <form onSubmit={submit} className="w-full max-w-xs space-y-4">
      <Input
        value={staffCode}
        onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
        placeholder="Staff code (e.g. W001)"
        autoCapitalize="characters"
        autoComplete="username"
        className="h-14 border-white/10 bg-white/10 text-center text-xl font-medium tracking-[0.3em] text-linen-50 placeholder:text-sm placeholder:tracking-normal placeholder:text-linen-400/70 focus:bg-white/15"
        required
      />
      {usePassword ? (
        <Input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="h-14 border-white/10 bg-white/10 text-center text-lg text-linen-50 placeholder:text-linen-400/70"
          required
        />
      ) : (
        <>
          <div className="flex justify-center gap-3 py-1" aria-label="PIN">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className={`size-3.5 rounded-full transition-colors ${i < secret.length ? "bg-brand-500" : "bg-white/15"}`} />
            ))}
            {secret.length > 4 ? Array.from({ length: secret.length - 4 }).map((_, i) => <span key={`x${i}`} className="size-3.5 rounded-full bg-brand-500" />) : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-2xl bg-white/[0.07] font-display text-3xl text-linen-50 ring-1 ring-white/10 transition-colors active:bg-brand-600">
                {d}
              </button>
            ))}
            <button type="button" onClick={() => setSecret("")} className="h-16 rounded-2xl text-sm font-semibold text-linen-400">
              Clear
            </button>
            <button type="button" onClick={() => press("0")} className="h-16 rounded-2xl bg-white/[0.07] font-display text-3xl text-linen-50 ring-1 ring-white/10 transition-colors active:bg-brand-600">
              0
            </button>
            <button type="button" onClick={() => setSecret((s) => s.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl text-linen-300" aria-label="Delete">
              <Delete className="size-6" />
            </button>
          </div>
        </>
      )}
      {error ? <p className="rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-100">{error}</p> : null}
      <Button type="submit" size="xl" className="w-full" loading={loading} disabled={!staffCode || secret.length < 4}>
        <LogIn className="size-5" /> Log in
      </Button>
      <button
        type="button"
        onClick={() => {
          setUsePassword((p) => !p);
          setSecret("");
        }}
        className="w-full text-center text-sm text-linen-400 underline-offset-4 hover:underline"
      >
        {usePassword ? "Use PIN pad instead" : "Manager? Use a password"}
      </button>
    </form>
  );
}
