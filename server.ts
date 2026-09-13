// Custom server: Next.js + Socket.io on one port, plus the escalation ticker.
// Run with `pnpm dev` (development) or `pnpm start` (after `pnpm build`).
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { rooms, setIO } from "./src/lib/realtime";
import {
  GUEST_COOKIE,
  STAFF_COOKIE,
  readCookie,
  verifyGuestToken,
  verifyStaffToken,
  type GuestClaims,
  type StaffClaims,
} from "./src/lib/tokens";

const port = Number(process.env.PORT || 3000);
const dev = process.env.NODE_ENV !== "production";
// Listen on all interfaces so phones on the restaurant Wi-Fi can reach a dev machine.
const host = process.env.HOST || "0.0.0.0";
const TICK_MS = 15_000;

const app = next({ dev, hostname: "localhost", port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  void handle(req, res);
});

const io = new Server(httpServer, {
  path: "/socket.io",
  serveClient: false,
  // Next.js also listens for upgrades (dev hot reload); don't kill sockets we don't own.
  destroyUpgrade: false,
  pingInterval: 20_000,
  pingTimeout: 20_000,
});
setIO(io);

type SocketAuth = { as?: "staff" | "guest" | "kds"; station?: "KITCHEN" | "BAR" };

io.use(async (socket, nextFn) => {
  const cookie = socket.handshake.headers.cookie;
  const auth = (socket.handshake.auth ?? {}) as SocketAuth;
  const data: { staff: StaffClaims | null; guest: GuestClaims | null; auth: SocketAuth } = {
    staff: auth.as === "guest" ? null : await verifyStaffToken(readCookie(cookie, STAFF_COOKIE)),
    guest: auth.as === "guest" ? await verifyGuestToken(readCookie(cookie, GUEST_COOKIE)) : null,
    auth,
  };
  socket.data = data;
  nextFn();
});

io.on("connection", (socket) => {
  const { staff, guest, auth } = socket.data as { staff: StaffClaims | null; guest: GuestClaims | null; auth: SocketAuth };
  if (guest) socket.join(rooms.session(guest.sessionId));
  if (staff) {
    socket.join(rooms.staff(staff.staffId));
    const manager = staff.role === "ADMIN" || staff.role === "MANAGER";
    if (auth.as === "kds" && auth.station) {
      if (manager || (staff.role === "KITCHEN" && (!staff.station || staff.station === auth.station))) {
        socket.join(rooms.station(auth.station));
      }
    } else {
      if (staff.role === "WAITER") socket.join(rooms.waiters);
      if (manager) socket.join(rooms.managers);
    }
  }
});

httpServer.listen(port, host, () => {
  console.log(`> Istanbul Cafe & Restaurant ordering on http://localhost:${port} (${dev ? "development" : "production"})`);
  if (process.env.APP_URL) console.log(`> Public URL (QR codes): ${process.env.APP_URL}`);
});

// Escalation ticker: runs inside the Next.js app so it shares the services.
const secret = process.env.INTERNAL_SECRET;
if (!secret) {
  console.warn("! INTERNAL_SECRET is not set — escalations (unclaimed orders, ignored requests) are disabled");
} else {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await fetch(`http://127.0.0.1:${port}/api/internal/tick`, {
        method: "POST",
        headers: { "x-internal-secret": secret },
      });
    } catch {
      // Server still starting or restarting; next tick will retry.
    } finally {
      running = false;
    }
  }, TICK_MS);
}
