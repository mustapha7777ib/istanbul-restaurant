"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Footprints } from "lucide-react";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Empty, Spinner } from "@/components/ui";
import { elapsed, minutesSince, useNow } from "@/hooks/useNow";
import { post } from "@/lib/client/api";
import { cn } from "@/lib/cn";
import { METHOD_TEXT, REQUEST_TEXT, type RequestItem } from "./types";

export function RequestsTab({ data, loading }: { data?: RequestItem[]; loading: boolean }) {
  const now = useNow(1000);
  const qc = useQueryClient();
  const toast = useToast();
  const act = useMutation({
    mutationFn: (a: { id: string; action: "ack" | "resolve" }) => post(`/api/requests/${a.id}/${a.action}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["requests"] });
      void qc.invalidateQueries({ queryKey: ["tables"] });
    },
    onError: (e) => toast({ tone: "error", title: "Couldn't update", body: e.message }),
  });
  if (loading) return <Spinner className="mx-auto mt-16" />;
  if (!data?.length) {
    return (
      <Empty icon={<ClipboardCheck className="size-12" />} title="No requests">
        When a guest taps “Call waiter”, “Water” or “Bill”, it shows up here.
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      {data.map((r) => {
        const late = r.status === "OPEN" && minutesSince(r.createdAt, now) >= 2;
        return (
          <Card key={r.id} className={cn("p-4", late && "ring-2 ring-red-400")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-3xl leading-none">{r.table.label}</p>
                <p className="mt-1 font-semibold">
                  {REQUEST_TEXT[r.type]}
                  {r.preferredMethod ? ` · ${METHOD_TEXT[r.preferredMethod]}` : ""}
                </p>
                {r.note ? <p className="text-sm italic text-ink-600">“{r.note}”</p> : null}
                <p className="mt-1 text-xs text-ink-500">
                  {r.table.area} · {elapsed(r.createdAt, now)} ago
                  {!r.mine && r.ownerName ? ` · ${r.ownerName}'s table` : ""}
                </p>
              </div>
              {r.status === "ACKNOWLEDGED" ? <Badge tone="blue">{r.acknowledgedBy ?? "Someone"} is on it</Badge> : late ? <Badge tone="red">Waiting</Badge> : <Badge tone="amber">New</Badge>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {r.status === "OPEN" ? (
                <Button variant="secondary" size="lg" loading={act.isPending && act.variables?.id === r.id && act.variables.action === "ack"} onClick={() => act.mutate({ id: r.id, action: "ack" })}>
                  <Footprints className="size-5" /> On my way
                </Button>
              ) : (
                <span />
              )}
              <Button variant="success" size="lg" loading={act.isPending && act.variables?.id === r.id && act.variables.action === "resolve"} onClick={() => act.mutate({ id: r.id, action: "resolve" })}>
                Done
              </Button>
            </div>
            {r.type === "BILL" ? <p className="mt-2 text-xs text-ink-500">Record the payment from “My tables” — the request closes automatically.</p> : null}
          </Card>
        );
      })}
    </div>
  );
}
