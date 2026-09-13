import { NextResponse, type NextRequest } from "next/server";
import { absolute } from "@/lib/origin";
import { STAFF_COOKIE, verifyStaffToken } from "@/lib/tokens";

// Staff areas need a valid staff session. Role checks happen in each page/API.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/staff/login") return NextResponse.next();
  const staff = await verifyStaffToken(request.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) {
    // Keep staff phones on the address they used (LAN IP or domain), not "localhost".
    return NextResponse.redirect(absolute(request.headers, `/staff/login?next=${encodeURIComponent(pathname + search)}`));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*", "/kds/:path*", "/admin/:path*"],
};
