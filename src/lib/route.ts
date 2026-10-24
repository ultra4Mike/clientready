import { scheduledJobs } from "@/lib/scheduled-jobs";
import type { Schedule } from "@/lib/schedule";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };
export type RouteStop = { id: string; title: string; client: string; address: string; startTime: string; status: Schedule["status"]; workerIds: string[] };

/** One day's stops in time order ("any time" last), optionally for one worker. Done jobs stay listed but are skipped in the directions. */
export function dayRoute(docs: Doc[], date: string, workerId = "all") {
  const stops: RouteStop[] = scheduledJobs(docs)
    .filter(({ schedule }) => schedule.date === date && (workerId === "all" || schedule.workerIds.includes(workerId)))
    .map(({ doc, schedule }) => ({
      id: doc.id,
      title: String(doc.data?.invoiceNumber || doc.title || "Job"),
      client: doc.clientName || String(doc.data?.clientName || ""),
      address: String(doc.data?.clientAddress || "").replace(/\s+/g, " ").trim(),
      startTime: schedule.startTime,
      status: schedule.status,
      workerIds: schedule.workerIds,
    }))
    .sort((a, b) => (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
  const routed = stops.filter((stop) => stop.address && stop.status !== "done");
  return { stops, routed, missing: stops.filter((stop) => !stop.address), directionsUrl: directionsUrl(routed.map((stop) => stop.address)), embedUrl: embedUrl(routed.map((stop) => stop.address)) };
}

/** Google Maps directions from the current location through every address (no API key). */
export function directionsUrl(addresses: string[]) {
  if (!addresses.length) return "";
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(0, -1).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
}

/**
 * Google Maps embed of the stops, loaded only when the owner taps "Show map".
 * With NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY (Maps Embed API, free; restrict it to the site's referrers) it is a real
 * driving route through every stop. Help retest: the old keyless "saddr/daddr …+to:…" form no longer draws
 * multi-stop routes (Google shows the whole world), so without a key a keyless map pins one stop (1 stop) or
 * draws the first → last stop (2+), and "Open route in Maps" still has every stop.
 */
export function embedUrl(addresses: string[], key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || "") {
  if (!addresses.length) return "";
  const enc = encodeURIComponent;
  if (key) {
    if (addresses.length === 1) return `https://www.google.com/maps/embed/v1/place?key=${enc(key)}&q=${enc(addresses[0])}`;
    const middle = addresses.slice(1, -1).slice(0, 20);
    return `https://www.google.com/maps/embed/v1/directions?key=${enc(key)}&origin=${enc(addresses[0])}&destination=${enc(addresses[addresses.length - 1])}${middle.length ? `&waypoints=${middle.map(enc).join("|")}` : ""}&mode=driving`;
  }
  if (addresses.length === 1) return `https://maps.google.com/maps?q=${enc(addresses[0])}&output=embed`;
  return `https://maps.google.com/maps?saddr=${enc(addresses[0])}&daddr=${enc(addresses[addresses.length - 1])}&output=embed`;
}
/** True when the keyless map can't show every stop (3+ stops and no embed key). */
export function embedPartial(count: number, key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || "") {
  return !key && count > 2;
}
