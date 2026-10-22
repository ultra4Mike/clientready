import { NextResponse } from "next/server";
import { estimateDriveMinutes } from "@/lib/timesheet";

/**
 * Expected drive minutes for one leg. Uses the Google Distance Matrix only when GOOGLE_MAPS_API_KEY is set;
 * otherwise (or if Google fails) a straight-line estimate from coordinates. Never errors for a missing key.
 * GET /api/drive-time?from=<address or lat,lng>&to=<address or lat,lng>
 */
const coords = (value: string) => {
  const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const geocode = (url.searchParams.get("geocode") || "").slice(0, 300);
  if (geocode) {
    // Job-site pin for the ~200 m warning. Only with a Maps key; without one the portal skips the distance check.
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return NextResponse.json({ lat: null, lng: null, source: "none" });
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geocode)}&key=${key}`, { signal: AbortSignal.timeout(5000) });
      const loc = (await res.json())?.results?.[0]?.geometry?.location;
      if (loc) return NextResponse.json({ lat: loc.lat, lng: loc.lng, source: "google" });
    } catch { /* no pin */ }
    return NextResponse.json({ lat: null, lng: null, source: "none" });
  }
  const from = (url.searchParams.get("from") || "").slice(0, 300), to = (url.searchParams.get("to") || "").slice(0, 300);
  if (!from || !to) return NextResponse.json({ minutes: null, source: "none" });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      const api = `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=${encodeURIComponent(from)}&destinations=${encodeURIComponent(to)}&key=${key}`;
      const res = await fetch(api, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      const seconds = data?.rows?.[0]?.elements?.[0]?.duration?.value;
      if (typeof seconds === "number") return NextResponse.json({ minutes: Math.round(seconds / 60), source: "google" });
    } catch { /* fall through to the estimate */ }
  }
  const a = coords(from), b = coords(to);
  if (a && b) return NextResponse.json({ minutes: estimateDriveMinutes(a, b), source: "estimate" });
  return NextResponse.json({ minutes: null, source: "none" });
}
