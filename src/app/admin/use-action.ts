"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/toast";
import type { ActionResult } from "./actions";

/** Run a server action, toast the result, and refresh the server-rendered page. */
export function useAction() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ tone: "success", title: success });
        after?.();
        router.refresh();
      } else toast({ tone: "error", title: "Not saved", body: r.error });
    });
  return { pending, run };
}
