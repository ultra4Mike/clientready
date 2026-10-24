import { estimateDriveMinutes } from "@/lib/timesheet";
import { signedInUserId } from "@/lib/api-auth";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

/**
 * Expected drive minutes for one leg. Uses the Google Distance Matrix only when GOOGLE_MAPS_API_KEY is set;
 * otherwise (or if Google fails) a straight-line estimate from coordinates. Never errors for a missing key.
 * GET /api/drive-time?from=<address or lat,lng>&to=<address or lat,lng>
 * Security batch: calls paid Google APIs, so it needs a signed-in owner or crew session (Bearer access token)
 * and is rate limited per IP and per user.
 */
export const coords = (value: string) => {
  const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};

export async function driveTime(request: Request, deps: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {}) {
  if (await rateLimitedShared(`drive-ip:${clientIp(request, deps.env)}`, 120, 60_000, deps)) return tooMany();
  const userId = await signedInUserId(request, deps);
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (await rateLimitedShared(`drive-user:${userId}`, 60, 60_000, deps)) return tooMany();
  const env = deps.env || process.env;
  const fetcher = deps.fetcher || fetch;
  const url = new URL(request.url);
  const geocode = (url.searchParams.get("geocode") || "").slice(0, 300);
  if (geocode) {
    // Job-site pin for the ~200 m warning. Only with a Maps key; without one the portal skips the distance check.
    const key = env.GOOGLE_MAPS_API_KEY;
    if (!key) return Response.json({ lat: null, lng: null, source: "none" });
    try {
      const res = await fetcher(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geocode)}&key=${key}`, { signal: AbortSignal.timeout(5000) });
      const loc = (await res.json())?.results?.[0]?.geometry?.location;
      if (loc) return Response.json({ lat: loc.lat, lng: loc.lng, source: "google" });
    } catch { /* no pin */ }
    return Response.json({ lat: null, lng: null, source: "none" });
  }
  const from = (url.searchParams.get("from") || "").slice(0, 300), to = (url.searchParams.get("to") || "").slice(0, 300);
  if (!from || !to) return Response.json({ minutes: null, source: "none" });
  const key = env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      const api = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(from)}&destinations=${encodeURIComponent(to)}&key=${key}`;
      const res = await fetcher(api, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      const seconds = data?.rows?.[0]?.elements?.[0]?.duration?.value;
      if (typeof seconds === "number") return Response.json({ minutes: Math.round(seconds / 60), source: "google" });
    } catch { /* fall through to the estimate */ }
  }
  const a = coords(from), b = coords(to);
  if (a && b) return Response.json({ minutes: estimateDriveMinutes(a, b), source: "estimate" });
  return Response.json({ minutes: null, source: "none" });
}
