// The address the visitor actually used (LAN IP, live domain, or a proxy's public
// host). The custom server runs Next with hostname "localhost", so `request.url`
// alone would send phones to localhost after a redirect.
export function publicOrigin(headers: Headers) {
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || (process.env.APP_URL?.startsWith("https://") ? "https" : "http");
    return `${proto}://${host}`;
  }
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const absolute = (headers: Headers, path: string) => new URL(path, publicOrigin(headers)).toString();
