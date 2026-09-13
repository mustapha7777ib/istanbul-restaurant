// Business time is Africa/Lagos (WAT, UTC+1). Nigeria has no daylight saving,
// so period boundaries use a fixed offset; display goes through Intl.

export const TIME_ZONE = "Africa/Lagos";
const OFFSET_MS = 60 * 60 * 1000;

function lagosParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-based
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** UTC instant of 00:00 Lagos time on the given Lagos calendar date. */
function lagosMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - OFFSET_MS);
}

export function lagosDayRange(date = new Date()) {
  const p = lagosParts(date);
  const start = lagosMidnight(p.year, p.month, p.day);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function lagosMonthKey(date = new Date()) {
  const p = lagosParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
}

export function lagosMonthRange(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`Invalid month "${monthKey}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return { start: lagosMidnight(year, month, 1), end: lagosMidnight(year, month + 1, 1) };
}

export function previousMonthKey(monthKey: string) {
  const { start } = lagosMonthRange(monthKey);
  return lagosMonthKey(new Date(start.getTime() - 1));
}

export function lagosHour(date: Date) {
  return lagosParts(date).hour;
}

export function lagosWeekday(date: Date) {
  return lagosParts(date).weekday;
}

/** Lagos calendar date as YYYY-MM-DD. */
export function lagosDateKey(date = new Date()) {
  const p = lagosParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function lagosDateRange(fromKey: string, toKey: string) {
  const parse = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
    if (!m) throw new Error(`Invalid date "${k}", expected YYYY-MM-DD`);
    return lagosMidnight(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const start = parse(fromKey);
  const end = new Date(parse(toKey).getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Opening hours as "HH:MM" strings in Lagos time. Handles overnight hours
 * (closing earlier than opening). Equal values mean open all day.
 */
export function isWithinOpeningHours(now: Date, opening: string, closing: string) {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const open = toMin(opening);
  const close = toMin(closing);
  if (open === close) return true;
  const p = lagosParts(now);
  const current = p.hour * 60 + p.minute;
  return open < close ? current >= open && current < close : current >= open || current < close;
}

const timeFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat("en-NG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TIME_ZONE, month: "long", year: "numeric" });

export const formatTime = (d: Date | string) => timeFmt.format(new Date(d));
export const formatDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d));
export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));
export const formatMonth = (monthKey: string) =>
  monthFmt.format(new Date(lagosMonthRange(monthKey).start.getTime() + 12 * 60 * 60 * 1000));

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const secondsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000;

export const daysAgo = (days: number, from = new Date()) => new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
