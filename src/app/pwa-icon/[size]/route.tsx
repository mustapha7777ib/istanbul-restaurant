import { ImageResponse } from "next/og";

const SIZES = new Set([96, 180, 192, 512]);

// App icon drawn on the fly: an ivory tulip (the flower of Istanbul) in a thin gold
// ring, on the crimson of their logo. Kept inside the maskable safe zone.
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size: raw } = await ctx.params;
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#911949" }}>
        <div
          style={{
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: "50%",
            border: `${Math.max(2, size * 0.014)}px solid #e9c678`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={size * 0.3} height={size * 0.4} viewBox="0 0 12 16" fill="#fcfaf7">
            <path d="M6 9.6C3.2 9.6 1.6 7.7 1.6 5.1L1.8 2 4.2 4.1 6 .8l1.8 3.3L10.2 2l.2 3.1c0 2.6-1.6 4.5-4.4 4.5Z" />
            <path d="M5.5 9.4h1v6.1h-1z" />
            <path d="M5.8 13.6c-2-.2-3.1-1.5-3.5-2.9 1.8.2 3 1.2 3.5 2.9Zm.4-1c2-.2 3.1-1.5 3.5-2.9-1.8.2-3 1.2-3.5 2.9Z" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
