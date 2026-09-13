import { setGuestCookie } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { absolute } from "@/lib/origin";
import { joinByQrToken } from "@/services/sessions";

// Redirect on the address the phone scanned (LAN IP, live domain or proxy),
// not the server's internal hostname.
const redirectTo = (request: Request, path: string) =>
  new Response(null, { status: 303, headers: { Location: absolute(request.headers, path) } });

// Target of the table QR code: join (or start) the table's visit, then open the menu.
export async function GET(request: Request, ctx: RouteContext<"/t/[token]">) {
  const { token } = await ctx.params;
  try {
    const { session, table } = await joinByQrToken(token);
    await setGuestCookie({ sessionId: session.id, tableId: table.id });
    return redirectTo(request, "/order");
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Something went wrong. Please ask a waiter for help.";
    return redirectTo(request, `/order?error=${encodeURIComponent(message)}`);
  }
}
