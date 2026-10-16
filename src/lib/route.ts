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

/** Keyless Google Maps embed of the stops (single place, or a route through them). Loaded only when the owner taps "Show map". */
export function embedUrl(addresses: string[]) {
  if (!addresses.length) return "";
  if (addresses.length === 1) return `https://maps.google.com/maps?q=${encodeURIComponent(addresses[0])}&output=embed`;
  const [first, ...rest] = addresses;
  return `https://maps.google.com/maps?saddr=${encodeURIComponent(first)}&daddr=${rest.map(encodeURIComponent).join("+to:")}&output=embed`;
}
