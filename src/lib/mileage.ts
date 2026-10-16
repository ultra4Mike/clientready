import { syncedList, type SyncedRow } from "@/lib/synced-list";

/** Owner mileage log (migration 20261016030000: profiles.mileage). Business trips for the tax year; owner only. */
export type Trip = SyncedRow & { date: string; miles: string; from: string; to: string; purpose: string; docId?: string };
export const MILEAGE_KEY = "clientready-mileage";
export const mileage = syncedList<Trip>(MILEAGE_KEY, "mileage");

export const milesOf = (trip: Trip) => Math.max(Number(String(trip.miles).replace(/[^0-9.]/g, "")) || 0, 0);
export function totalMiles(trips: Trip[], year?: string) {
  return Math.round(trips.filter((trip) => !year || trip.date.startsWith(year)).reduce((sum, trip) => sum + milesOf(trip), 0) * 10) / 10;
}
export function mileageCsv(trips: Trip[]) {
  const q = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [...trips].sort((a, b) => a.date.localeCompare(b.date)).map((trip) => [trip.date, milesOf(trip).toString(), trip.from, trip.to, trip.purpose].map(q).join(","));
  return ["Date,Miles,From,To,Purpose", ...rows].join("\n");
}
