/**
 * Overdue fix: "today" for due dates is the business-zone calendar day (profiles.timezone, cached in
 * clientready-profile; default America/Chicago), never UTC and never a traveling phone's zone.
 */
const FALLBACK = "America/Chicago";

export function bizZone(): string {
  if (typeof window === "undefined") return FALLBACK;
  try {
    const tz = String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").timezone || "");
    if (tz) { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; }
  } catch { /* bad JSON or zone: fallback */ }
  return FALLBACK;
}

/** "2026-10-22": the calendar day of `at` in the business zone. */
export function bizToday(at: Date = new Date(), zone: string = bizZone()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
