"use client";

// Small SVG/HTML charts for the reports page. Conventions (dataviz method):
// single series → one hue (slot 1 blue), no legend; thin marks (≤24px, 4px rounded
// data-end, square at baseline); hairline solid gridlines; every mark has a hover/focus
// tooltip; values also available as a table so nothing is gated on hover.

import { useEffect, useRef, useState, type ReactNode } from "react";

// Istanbul chart palette, validated with the dataviz checker (lightness band, chroma,
// colour-blind separation across all pairs, contrast on white): slot order crimson →
// blue → brass must be kept. Crimson and brass are the logo's and the room's own colours.
export const VIZ = {
  surface: "#ffffff",
  series1: "#bc3b68",
  series2: "#2a78d6",
  series3: "#9d7422",
  ink: "#0c162c",
  ink2: "#394662",
  muted: "#6b7489",
  grid: "#ebe6de",
  axis: "#d5ccbe",
  zero: "#f7f4ed",
  // Sequential crimson, light → dark (even OKLCH lightness steps on the logo's hue)
  seq: ["#fee1e7", "#f9cad4", "#f1b3c2", "#e99db0", "#e1869e", "#d76f8d", "#cd577c", "#bf416c", "#ad2f5d", "#9b1c4f", "#831741", "#6b1335", "#540e29"],
};

function niceMax(max: number, ticks = 4) {
  if (max <= 0) return { top: 1, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

type Tip = { x: number; y: number; value: string; label: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-black/10"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="font-bold text-ink-900">{tip.value}</p>
      <p className="text-ink-600">{tip.label}</p>
    </div>
  );
}

/** Rounded top corners only (square at the baseline). */
function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function ColumnChart({
  data,
  format,
  compact,
  height = 220,
  ariaLabel,
}: {
  data: { key: string; label: string; value: number }[];
  format: (v: number) => string;
  compact: (v: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const padL = 56;
  const padB = 24;
  const padT = 20;
  const plotW = Math.max(0, width - padL - 8);
  const plotH = height - padB - padT;
  const { top, step } = niceMax(Math.max(...data.map((d) => d.value), 0));
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 48))));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  return (
    <div ref={ref} className="relative" onPointerLeave={() => (setTip(null), setHover(null))}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => {
            const y = padT + plotH - (t / top) * plotH;
            return (
              <g key={t}>
                <line x1={padL} x2={width - 8} y1={y} y2={y} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
                <text x={padL - 8} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill={VIZ.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {compact(t)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / top) * plotH;
            const x = padL + i * band + (band - barW) / 2;
            const y = padT + plotH - h;
            const cx = x + barW / 2;
            const show = () => {
              setHover(d.key);
              setTip({ x: cx, y, value: format(d.value), label: d.label });
            };
            return (
              <g key={d.key}>
                {h > 0 ? <path d={columnPath(x, y, barW, h)} fill={VIZ.series1} opacity={hover && hover !== d.key ? 0.55 : 1} /> : null}
                {/* Hit target: the whole band, not just the painted bar */}
                <rect
                  x={padL + i * band}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${format(d.value)}`}
                  onPointerMove={show}
                  onFocus={show}
                  onBlur={() => (setTip(null), setHover(null))}
                  className="outline-none"
                />
                {i === maxIdx && d.value > 0 ? (
                  <text x={cx} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={VIZ.ink2}>
                    {compact(d.value)}
                  </text>
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill={VIZ.muted}>
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Part-to-whole in one horizontal bar, 2px surface gaps between segments, legend + direct values. */
export function StackedBar({
  segments,
  format,
}: {
  segments: { label: string; value: number; color: string }[];
  format: (v: number) => string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const [tip, setTip] = useState<Tip>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
        <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded bg-white">
          {total === 0 ? <div className="h-full w-full rounded bg-linen-300" /> : null}
          {visible.map((s, i) => {
            const pct = (s.value / total) * 100;
            const show = (el: HTMLElement) => {
              const box = el.getBoundingClientRect();
              const parent = ref.current!.getBoundingClientRect();
              setTip({ x: box.left - parent.left + box.width / 2, y: 0, value: `${format(s.value)} · ${pct.toFixed(0)}%`, label: s.label });
            };
            return (
              <div
                key={s.label}
                tabIndex={0}
                aria-label={`${s.label}: ${format(s.value)}, ${pct.toFixed(0)}%`}
                onPointerMove={(e) => show(e.currentTarget)}
                onFocus={(e) => show(e.currentTarget)}
                onBlur={() => setTip(null)}
                className={`h-full outline-none ${i === 0 ? "rounded-l" : ""} ${i === visible.length - 1 ? "rounded-r" : ""}`}
                style={{ width: `${pct}%`, background: s.color }}
              />
            );
          })}
        </div>
        <Tooltip tip={tip} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-600">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
            </span>
            <span className="tabular-nums">
              <b className="text-ink-900">{format(s.value)}</b>
              <span className="ml-2 text-ink-500">{total ? `${((s.value / total) * 100).toFixed(0)}%` : "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars with the value at the tip. Single series. */
export function BarList({ rows, format, extra }: { rows: { label: string; value: number; note?: ReactNode }[]; format: (v: number) => string; extra?: (i: number) => ReactNode }) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}`}>
          <span className="truncate text-ink-600">{r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 rounded-r" style={{ width: `${Math.max(1, (r.value / max) * 78)}%`, background: VIZ.series1 }} />
            <span className="shrink-0 font-semibold tabular-nums text-ink-900">{format(r.value)}</span>
            {extra ? <span className="shrink-0 text-xs text-ink-500">{extra(i)}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Orders by weekday × hour (Lagos time). Sequential blue; empty cells stay near the surface. */
export function Heatmap({ grid }: { grid: number[][] }) {
  const [tip, setTip] = useState<Tip>(null);
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(...grid.flat(), 0);
  const activeHours = grid[0].map((_, h) => h).filter((h) => grid.some((row) => row[h] > 0));
  const first = activeHours.length ? Math.max(0, Math.min(...activeHours) - 1) : 8;
  const last = activeHours.length ? Math.min(23, Math.max(...activeHours) + 1) : 23;
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const color = (v: number) => (v === 0 ? VIZ.zero : VIZ.seq[Math.min(VIZ.seq.length - 1, Math.round((v / max) * (VIZ.seq.length - 1)))]);
  // Monday first for a restaurant week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div ref={ref} className="relative overflow-x-auto" onPointerLeave={() => setTip(null)}>
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="w-7 text-center text-[10px] font-normal text-ink-500">
                {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((d) => (
            <tr key={d}>
              <th className="pr-2 text-right text-xs font-normal text-ink-600">{DAYS[d]}</th>
              {hours.map((h) => {
                const v = grid[d][h];
                const show = (el: HTMLElement) => {
                  const box = el.getBoundingClientRect();
                  const parent = ref.current!.getBoundingClientRect();
                  setTip({ x: box.left - parent.left + box.width / 2 + ref.current!.scrollLeft, y: box.top - parent.top, value: `${v} order${v === 1 ? "" : "s"}`, label: `${DAYS[d]} ${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00` });
                };
                return (
                  <td
                    key={h}
                    tabIndex={0}
                    aria-label={`${DAYS[d]} ${h}:00, ${v} orders`}
                    onPointerMove={(e) => show(e.currentTarget)}
                    onFocus={(e) => show(e.currentTarget)}
                    className="h-6 w-7 rounded-[3px] outline-none focus:ring-2 focus:ring-ink-900"
                    style={{ background: color(v) }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
        <span>Fewer</span>
        <span className="flex gap-[2px]">
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <span key={i} className="h-2.5 w-5 rounded-[2px]" style={{ background: VIZ.seq[i] }} />
          ))}
        </span>
        <span>More orders</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
