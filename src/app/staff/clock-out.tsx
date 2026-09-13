"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Sheet, Spinner } from "@/components/ui";
import { api, post } from "@/lib/client/api";
import { formatNaira } from "@/lib/money";

type Summary = {
  shift: { id: string; clockInAt: string } | null;
  totals?: { byMethod: { CASH: number; POS: number; TRANSFER: number }; tips: number; count: number; total: number };
};

/** End of shift: shows money collected and records the cash handed in. */
export function ClockOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const summary = useQuery({ queryKey: ["shift-summary"], queryFn: () => api<Summary>("/api/staff/shift"), enabled: open });
  const [cash, setCash] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const expected = summary.data?.totals?.byMethod.CASH ?? 0;
  const cashValue = cash ?? String(expected / 100);
  const out = useMutation({
    mutationFn: () => post("/api/staff/shift", { action: "out", cashDeclaredKobo: Math.round(Number(cashValue || 0) * 100) }),
    onSuccess: () => {
      toast({ tone: "success", title: "Clocked out", body: "Hand the cash to the manager. Thank you!" });
      onClose();
      void qc.invalidateQueries();
    },
    onError: (e) => toast({ tone: "error", title: "Can't clock out yet", body: e.message }),
  });
  const t = summary.data?.totals;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Clock out"
      footer={
        <Button size="xl" className="w-full" loading={out.isPending} onClick={() => out.mutate()}>
          Clock out
        </Button>
      }
    >
      {summary.isPending ? (
        <Spinner className="mx-auto my-6" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-linen-100 p-4">
            <p className="text-sm font-semibold text-ink-600">Collected this shift</p>
            <dl className="mt-2 space-y-1 text-sm">
              <Line label="Cash" value={formatNaira(t?.byMethod.CASH ?? 0)} strong />
              <Line label="POS" value={formatNaira(t?.byMethod.POS ?? 0)} />
              <Line label="Transfer" value={formatNaira(t?.byMethod.TRANSFER ?? 0)} />
              <Line label="Tips recorded" value={formatNaira(t?.tips ?? 0)} />
            </dl>
          </div>
          <Field label="Cash you are handing in (₦)" hint="The manager checks this against the cash payments you recorded.">
            <Input type="number" inputMode="decimal" value={cashValue} onChange={(e) => setCash(e.target.value)} className="text-lg font-bold" />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
