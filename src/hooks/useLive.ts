"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { EventName, Ping } from "@/lib/realtime";

type Options = {
  as: "staff" | "guest" | "kds";
  station?: "KITCHEN" | "BAR";
  /** Which query keys to refetch for each server event. */
  invalidate: Partial<Record<Exclude<EventName, "ping">, readonly (readonly unknown[])[]>>;
  onPing?: (ping: Ping) => void;
};

/**
 * One Socket.io connection per screen. Server events are mostly "something
 * changed" signals, so we refetch the matching queries; on reconnect we refetch
 * everything in case events were missed while offline.
 */
export function useLive({ as, station, invalidate, onPing }: Options) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const opts = useRef({ invalidate, onPing });
  useEffect(() => {
    opts.current = { invalidate, onPing };
  });

  useEffect(() => {
    const socket: Socket = io({ path: "/socket.io", auth: { as, station }, transports: ["websocket", "polling"] });
    let hadConnected = false;
    socket.on("connect", () => {
      setConnected(true);
      if (hadConnected) void qc.invalidateQueries();
      hadConnected = true;
    });
    socket.on("disconnect", () => setConnected(false));
    socket.onAny((event: EventName, payload: unknown) => {
      if (event === "ping") {
        opts.current.onPing?.(payload as Ping);
        return;
      }
      for (const key of opts.current.invalidate[event] ?? []) void qc.invalidateQueries({ queryKey: key });
    });
    return () => {
      socket.close();
    };
  }, [as, station, qc]);

  return { connected };
}
