"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, Timer } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, Sheet, Spinner, Textarea } from "@/components/ui";
import { elapsed, minutesSince, useNow } from "@/hooks/useNow";
import { post } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { formatNaira } from "@/lib/money";
import type { QueueItem } from "./types";

const REJECT_REASONS = ["Nobody at the table", "Duplicate order", "Guest cancelled", "Item not available"];

export const REJECT_REASONS_UNPAID = ["Guest changed their mind", "Guest left", "Guest won't pay first", "Item not available"];

export function QueueTab({ data, loading }: { data?: QueueItem[]; loading: boolean }) {
  const now = useNow(1000);
  const [rejecting, setRejecting] = useState<QueueItem | null>(null);
  if (loading) return <Spinner className="mx-auto mt-16" />;
  if (!data?.length) {
    return (
      <Empty icon={<BellOff className="size-12" />} title="No orders waiting">
        New orders from the tables will appear here with a ring. Keep your phone close.
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((o) => (
        <QueueCard key={o.id} order={o} now={now} onReject={() => setRejecting(o)} />
      ))}
      <RejectSheet order={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}

function QueueCard({ order: o, now, onReject }: { order: QueueItem; now: number; onReject: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const claim = useMutation({
    mutationFn: () => post(`/api/orders/${o.id}/claim`),
    onSuccess: () => {
      toast({
        tone: "success",
        title: `${o.table.label} is yours`,
        body: o.dueKobo > 0 ? `Collect ${formatNaira(o.dueKobo)} at the table — then it goes to the kitchen/bar.` : "Already paid at the table — send it to the kitchen from My tables.",
      });
      void qc.invalidateQueries({ queryKey: ["queue"] });
      void qc.invalidateQueries({ queryKey: ["tables"] });
    },
    onError: (e) => {
      toast({ tone: "error", title: "Couldn't accept", body: e.message });
      void qc.invalidateQueries({ queryKey: ["queue"] });
    },
  });
  const waitMin = minutesSince(o.placedAt, now);
  return (
    <Card className={cn("overflow-hidden", o.escalatedAt && "ring-2 ring-red-400")}>
      <div className="flex items-start justify-between gap-3 bg-ink-900 px-4 py-3 text-white">
        <div>
          <p className="font-display text-4xl leading-none">{o.table.label}</p>
          <p className="mt-1 text-sm text-linen-400">
            {o.table.area} · #{o.seq}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {o.newTable ? <Badge tone="brand">NEW TABLE</Badge> : o.mine ? <Badge tone="green">Your table</Badge> : o.ownerName ? <Badge tone="amber">{o.ownerName}&apos;s table</Badge> : null}
          <span className={cn("flex items-center gap-1 text-sm font-semibold tabular-nums", waitMin >= 2 ? "text-red-400" : waitMin >= 1 ? "text-amber-300" : "text-linen-400")}>
            <Timer className="size-4" /> {elapsed(o.placedAt, now)}
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        {o.escalatedAt ? <p className="mb-2 text-sm font-semibold text-red-600">Waiting too long — anyone can take this now.</p> : null}
        {o.newTable ? <p className="mb-2 text-xs text-ink-500">First order from this table — check guests are seated when you get there.</p> : null}
        <ul className="space-y-1.5">
          {o.items.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span className="w-7 shrink-0 text-right font-bold">{i.qty}×</span>
              <span>
                <span className="font-medium">{i.name}</span>
                {i.station === "BAR" ? <span className="ml-1 text-xs text-sky-700">bar</span> : null}
                {i.options ? <span className="block text-sm text-ink-600">{i.options}</span> : null}
                {i.note ? <span className="block text-sm font-semibold italic text-amber-700">“{i.note}”</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {o.note ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {o.note}</p> : null}
        <div className="mt-3 flex items-end justify-between border-t border-dashed border-linen-300 pt-2">
          <span className="text-sm text-ink-500">Kitchen time ~{o.estimateMinutes} min</span>
          <span className="text-right">
            <span className="block text-xs text-ink-500">{o.dueKobo < o.totalKobo ? "To collect (rest already paid at the table)" : o.extras ? `To collect (incl. ${o.extras})` : "To collect"}</span>
            <span className="text-lg font-bold">{formatNaira(o.dueKobo)}</span>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-2 border-t border-linen-200 p-3">
        <Button variant="secondary" size="lg" onClick={onReject}>
          Decline
        </Button>
        <Button variant="success" size="lg" loading={claim.isPending} onClick={() => claim.mutate()}>
          <Check className="size-5" /> Accept
        </Button>
      </div>
    </Card>
  );
}

export function RejectSheet({
  order,
  onClose,
  reasons = REJECT_REASONS,
}: {
  order: { id: string; table: { label: string } } | null;
  onClose: () => void;
  reasons?: string[];
}) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const reject = useMutation({
    mutationFn: (r: string) => post(`/api/orders/${order!.id}/reject`, { reason: r }),
    onSuccess: () => {
      toast({ tone: "info", title: "Order declined", body: "The guest has been told." });
      setReason("");
      onClose();
      void qc.invalidateQueries({ queryKey: ["queue"] });
      void qc.invalidateQueries({ queryKey: ["tables"] });
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't decline", body: e.message }),
  });
  return (
    <Sheet open={Boolean(order)} onClose={onClose} title={`Decline order ${order ? `· ${order.table.label}` : ""}`}>
      <div className="space-y-2">
        <p className="text-sm text-ink-600">The guest sees the reason. This is logged.</p>
        {reasons.map((r) => (
          <Button key={r} variant="secondary" size="lg" className="w-full justify-start" loading={reject.isPending && reject.variables === r} onClick={() => reject.mutate(r)}>
            {r}
          </Button>
        ))}
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Other reason" maxLength={200} />
        <Button variant="danger" size="lg" className="w-full" disabled={reason.trim().length < 2} onClick={() => reject.mutate(reason.trim())}>
          Decline with this reason
        </Button>
      </div>
    </Sheet>
  );
}
