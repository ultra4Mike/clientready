/**
 * Real route drive times (Google Distance Matrix via /api/drive-time when GOOGLE_MAPS_API_KEY is set), cached per
 * job pair per day in localStorage so each leg is fetched at most once a day. Without a key the API answers
 * "estimate"/"none" and nothing is cached, so the straight-line estimate keeps being used.
 */
const KEY = "clientready-route-minutes";
type Cache = Record<string, number>;
const keyOf = (date: string, from: string, to: string) => `${date}|${from}|${to}`;
function read(): Cache { try { return JSON.parse(window.localStorage.getItem(KEY) || "{}") as Cache; } catch { return {}; } }
export function readRouteMinutes(date: string, fromDocId: string, toDocId: string): number | undefined {
  if (typeof window === "undefined") return undefined;
  const v = read()[keyOf(date, fromDocId, toDocId)];
  return typeof v === "number" && v > 0 ? v : undefined;
}
export function writeRouteMinutes(date: string, fromDocId: string, toDocId: string, minutes: number) {
  try {
    const all = read();
    // Keep the last 30 days only.
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(all)) if (k.slice(0, 10) < cut) delete all[k];
    all[keyOf(date, fromDocId, toDocId)] = minutes;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full */ }
}
/** Fetch and cache the Google route time for each leg (addresses), only when not cached. Returns how many were added. */
export async function warmRoutes(legs: { date: string; fromDocId: string; toDocId: string; from: string; to: string }[], fetcher: (input: string) => Promise<Response> = (input) => import("@/lib/authed-fetch").then((m) => m.authedFetch(input))) {
  let added = 0;
  for (const leg of legs) {
    if (!leg.from || !leg.to || readRouteMinutes(leg.date, leg.fromDocId, leg.toDocId) !== undefined) continue;
    try {
      const res = await fetcher(`/api/drive-time?from=${encodeURIComponent(leg.from)}&to=${encodeURIComponent(leg.to)}`);
      const data = await res.json();
      if (data?.source === "google" && typeof data.minutes === "number") { writeRouteMinutes(leg.date, leg.fromDocId, leg.toDocId, data.minutes); added++; }
    } catch { /* offline: estimate stays */ }
  }
  return added;
}
