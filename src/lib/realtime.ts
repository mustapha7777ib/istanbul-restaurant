// Live updates. server.ts creates the Socket.io server and stores it on
// globalThis; services call `notify` after their transaction commits.
//
// Events are mostly "invalidate" signals — clients refetch the matching query —
// plus `ping`, which carries a message and makes the device beep/vibrate.

import type { Server } from "socket.io";

export type PingKind = "order" | "ready" | "request" | "alert" | "info";

export type Ping = {
  kind: PingKind;
  title: string;
  body: string;
  url?: string;
};

export type RealtimeEvents = {
  /** Waiter queue (claimable orders) changed. */
  queue: Record<string, never>;
  /** A waiter's tables / requests changed. */
  tables: Record<string, never>;
  /** Kitchen/bar tickets changed. */
  kds: { station: "KITCHEN" | "BAR" };
  /** A guest session (orders, bill, waiter) changed. */
  session: { sessionId: string };
  /** Manager live floor changed. */
  floor: Record<string, never>;
  /** Menu availability changed (everyone refetches the menu). */
  menu: Record<string, never>;
  ping: Ping;
};

export type EventName = keyof RealtimeEvents;

export const rooms = {
  waiters: "waiters",
  managers: "managers",
  staff: (id: string) => `staff:${id}`,
  station: (s: "KITCHEN" | "BAR") => `station:${s}`,
  session: (id: string) => `session:${id}`,
  everyone: "everyone",
};

type Emitted = { rooms: string[]; event: EventName; payload: unknown };

const g = globalThis as unknown as { __io?: Server; __rtLog?: Emitted[] };

export function setIO(io: Server) {
  g.__io = io;
}

/** Tests can record emitted events instead of needing a socket server. */
export function recordEvents() {
  g.__rtLog = [];
  return g.__rtLog;
}

export function notify<E extends EventName>(targetRooms: string[], event: E, payload: RealtimeEvents[E]) {
  if (targetRooms.length === 0) return;
  g.__rtLog?.push({ rooms: targetRooms, event, payload });
  const io = g.__io;
  if (!io) return;
  if (targetRooms.includes(rooms.everyone)) io.emit(event, payload);
  else io.to(targetRooms).emit(event, payload);
}

/** Collects notifications during a service call and sends them after commit. */
export class Outbox {
  private items: { rooms: string[]; event: EventName; payload: unknown }[] = [];
  private pushes: { staffIds: string[] | "waiters-on-shift"; ping: Ping }[] = [];

  add<E extends EventName>(targetRooms: string[], event: E, payload: RealtimeEvents[E]) {
    this.items.push({ rooms: targetRooms, event, payload });
    return this;
  }

  /** Socket ping + Web Push (for locked phones). */
  ping(targetRooms: string[], push: string[] | "waiters-on-shift", ping: Ping) {
    this.items.push({ rooms: targetRooms, event: "ping", payload: ping });
    this.pushes.push({ staffIds: push, ping });
    return this;
  }

  flush() {
    // Dedupe identical invalidations (same event + payload) and merge their rooms.
    const merged = new Map<string, { rooms: Set<string>; event: EventName; payload: unknown }>();
    for (const [i, it] of this.items.entries()) {
      const k = it.event === "ping" ? `ping:${i}` : `${it.event}:${JSON.stringify(it.payload)}`;
      const existing = merged.get(k);
      if (existing) it.rooms.forEach((r) => existing.rooms.add(r));
      else merged.set(k, { rooms: new Set(it.rooms), event: it.event, payload: it.payload });
    }
    for (const m of merged.values()) {
      notify([...m.rooms], m.event, m.payload as never);
    }
    const pushes = this.pushes;
    this.items = [];
    this.pushes = [];
    if (pushes.length) {
      // Imported lazily so tests and scripts don't need VAPID configuration.
      void import("./push")
        .then(({ sendPush }) => Promise.all(pushes.map((p) => sendPush(p.staffIds, p.ping))))
        .catch((err) => console.error("[push] failed", err));
    }
  }
}
