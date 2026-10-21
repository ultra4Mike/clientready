import { syncedList, type SyncedRow } from "@/lib/synced-list";

/** Owner mileage log (migration 20261016030000: profiles.mileage). Business trips for the tax year; owner only. */
/**
 * source: "invoice" = miles typed on an invoice (one trip per invoice, id inv-<docId>); "daily"/"weekly" = the owner's
 * quick total for a day / Monday-week (id daily-<date> / weekly-<monday>); "" = a single trip typed on /mileage.
 * A daily/weekly total counts only what isn't already logged in that period (Help R28: no double counting).
 */
export type Trip = SyncedRow & { date: string; miles: string; from: string; to: string; purpose: string; docId?: string; source?: "invoice" | "daily" | "weekly" | ""; until?: string };
export const MILEAGE_KEY = "clientready-mileage";
export const mileage = syncedList<Trip>(MILEAGE_KEY, "mileage");

export const milesOf = (trip: Trip) => Math.max(Number(String(trip.miles).replace(/[^0-9.]/g, "")) || 0, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
/** Miles a trip adds after removing what other trips already cover in a daily/weekly total's period. */
export function addedMiles(trip: Trip, trips: Trip[]): number {
  const miles = milesOf(trip);
  if (trip.source !== "daily" && trip.source !== "weekly") return miles;
  const to = trip.until || trip.date;
  const covered = trips.filter((other) => other.id !== trip.id && !other.deleted && other.date >= trip.date && other.date <= to && (other.source !== "weekly") && (trip.source === "weekly" || other.source !== "daily"))
    // A day's total already includes that day's trips, so count what it adds, not its full number.
    .reduce((sum, other) => sum + (other.source === "daily" ? addedMiles(other, trips) : milesOf(other)), 0);
  return round1(Math.max(miles - covered, 0));
}
/** Trips with daily/weekly totals reduced to what they add (for totals, CSV and the accountant package). */
export function countedTrips(trips: Trip[]): Trip[] {
  return trips.map((trip) => (trip.source === "daily" || trip.source === "weekly" ? { ...trip, miles: String(addedMiles(trip, trips)) } : trip));
}
export function totalMiles(trips: Trip[], year?: string) {
  return round1(countedTrips(trips).filter((trip) => !year || trip.date.startsWith(year)).reduce((sum, trip) => sum + milesOf(trip), 0));
}

/** Saves (or removes when blank/0) the invoice's own trip. */
export function saveInvoiceTrip(docId: string, input: { miles: string; date: string; label: string; previousId?: string }) {
  if (input.previousId && input.previousId !== docId) mileage.remove(`inv-${input.previousId}`);
  const id = `inv-${docId}`;
  const miles = Math.max(Number(String(input.miles).replace(/[^0-9.]/g, "")) || 0, 0);
  const existing = mileage.read().find((trip) => trip.id === id);
  if (!miles) { if (existing) mileage.remove(id); return; }
  if (existing && existing.miles === String(miles) && existing.date === input.date && existing.purpose === input.label) return;
  mileage.upsert({ id, date: input.date, miles: String(miles), from: "", to: "", purpose: input.label, docId, source: "invoice" });
}
export function mileageCsv(trips: Trip[]) {
  const q = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [...countedTrips(trips)].sort((a, b) => a.date.localeCompare(b.date)).map((trip) => [trip.date, milesOf(trip).toString(), trip.from, trip.to, trip.purpose].map(q).join(","));
  return ["Date,Miles,From,To,Purpose", ...rows].join("\n");
}
