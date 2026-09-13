"use client";

import { Crown } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { formatMonth } from "@/lib/time";
import { giveAwardAction } from "../actions";
import { useAction } from "../use-action";

export function MonthPicker({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  return (
    <Select className="h-10 w-auto" value={value} onChange={(e) => router.push(`/admin/awards?month=${e.target.value}`)}>
      {months.map((m) => (
        <option key={m} value={m}>
          {formatMonth(m)}
        </option>
      ))}
    </Select>
  );
}

export function AwardButton({ month, category, staffId, name }: { month: string; category: "WAITER" | "KITCHEN"; staffId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => {
        const note = prompt(`Name ${name} ${category === "WAITER" ? "Waiter" : "Kitchen & Bar"} of the Month for ${formatMonth(month)}?\n\nAdd a short citation (optional):`, "");
        if (note !== null) run(() => giveAwardAction({ month, category, staffId, note: note || undefined }), `${name} is Staff of the Month!`);
      }}
    >
      <Crown className="size-4" /> Award
    </Button>
  );
}
