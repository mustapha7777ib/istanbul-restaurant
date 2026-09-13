"use client";

import { Check, Flag } from "lucide-react";
import { Button } from "@/components/ui";
import { reconcileShiftAction } from "../actions";
import { useAction } from "../use-action";

export function ReconcileButtons({ shiftId }: { shiftId: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="success" loading={pending} onClick={() => run(() => reconcileShiftAction(shiftId, "CONFIRMED"), "Cash confirmed")}>
        <Check className="size-4" /> Confirm
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          const note = prompt("What's wrong? (e.g. ₦2,000 short)");
          if (note) run(() => reconcileShiftAction(shiftId, "DISPUTED", note), "Shift flagged");
        }}
      >
        <Flag className="size-4" /> Dispute
      </Button>
    </div>
  );
}
