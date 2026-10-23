/**
 * 24-hour calendar + overnight jobs (cal24). Pure helpers, no imports, so server code and unit tests can use them.
 * A job whose end time is earlier than its start (e.g. 22:00 to 04:00) runs past midnight: it lasts until the end time
 * on the NEXT day. Its date is the day it starts; it also shows on the next day as a continuation.
 * Day boundaries use the business time zone (profiles.timezone, default America/Chicago), never UTC.
 */
export const DAY_MINUTES = 24 * 60;
export const DEFAULT_LENGTH = 60;
const isT = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
export const toMinutes = (t: string) => { const [h, m] = String(t || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const fromMinutes = (total: number) => { const m = ((Math.round(total) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** True when a start/end pair runs past midnight (end earlier than start). */
export function crossesMidnight(start?: string, end?: string) {
  return isT(start) && isT(end) && toMinutes(end) < toMinutes(start);
}
/** Minutes a job lasts: end - start, +24 h when it runs past midnight; no end (or end = start) = default length. */
export function jobMinutes(start?: string, end?: string, fallback = DEFAULT_LENGTH) {
  if (!isT(start)) return fallback;
  if (!isT(end)) return fallback;
  const d = toMinutes(end) - toMinutes(start);
  return d > 0 ? d : d < 0 ? d + DAY_MINUTES : fallback;
}
/** "2026-10-22" + n days (calendar arithmetic, no time zone involved). */
export function addDaysYmd(value: string, days: number) {
  const [y, m, d] = value.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
/** Valid IANA zone or the default. */
export function safeZone(tz?: unknown) {
  if (typeof tz === "string" && tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { /* fall through */ } }
  return "America/Chicago";
}
/** The account's business zone as cached on this device (profile row), default America/Chicago. */
export function cachedBusinessZone() {
  if (typeof window === "undefined") return "America/Chicago";
  try { return safeZone(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}")?.timezone); } catch { return "America/Chicago"; }
}
/** Business-zone date and minute-of-day of an instant (11:44 PM CT stays Thursday, never UTC Friday). */
export function zonedNow(now: Date = new Date(), tz = cachedBusinessZone()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: safeZone(tz), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
export const businessToday = (now?: Date, tz?: string) => zonedNow(now, tz).date;

type Sched = { date?: string; startTime?: string; endTime?: string };
/**
 * What a job occupies on one calendar day: its own day (start → end or midnight) or, for an overnight job, the next day
 * (midnight → end, continuation). null when it isn't on that day.
 */
export function segmentOn(s: Sched, day: string): { start: number; end: number; continued: boolean; continues: boolean } | null {
  if (!s.date || !isT(s.startTime)) return s.date === day ? { start: 0, end: 0, continued: false, continues: false } : null;
  const start = toMinutes(s.startTime), length = jobMinutes(s.startTime, s.endTime);
  if (s.date === day) return { start, end: Math.min(DAY_MINUTES, start + length), continued: false, continues: start + length > DAY_MINUTES };
  if (addDaysYmd(s.date, 1) === day && start + length > DAY_MINUTES) return { start: 0, end: start + length - DAY_MINUTES, continued: true, continues: false };
  return null;
}
/** Hour rows for the calendar: always all 24 (12 AM to 11 PM). */
export const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h);
/** First hour the compact calendar scrolls to: business hours (6 AM), or an hour before now when now is outside them. */
export function scrollHour(showsToday: boolean, nowMinutes: number, earliestJobHour?: number) {
  const nowHour = Math.floor(nowMinutes / 60);
  if (showsToday && (nowHour < 6 || nowHour >= 19)) return Math.max(0, nowHour - 1);
  if (typeof earliestJobHour === "number" && earliestJobHour < 6) return earliestJobHour;
  return 6;
}
