import { syncedList, type SyncedRow } from "@/lib/synced-list";

/** Owner parts inventory (migration 20261016040000: profiles.inventory). Costs are owner-only. */
export type Part = SyncedRow & { name: string; qty: string; unit: string; cost: string; low: string; sku?: string };
export const inventory = syncedList<Part>("clientready-inventory", "inventory");
const n = (value: string) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
export const qtyOf = (part: Part) => n(part.qty);
export const isLow = (part: Part) => String(part.low ?? "").trim() !== "" && qtyOf(part) <= n(part.low);
export const stockValue = (parts: Part[]) => Math.round(parts.reduce((sum, part) => sum + Math.max(qtyOf(part), 0) * n(part.cost), 0) * 100) / 100;
/** New quantity after +/-; never below 0. */
export const adjust = (part: Part, delta: number): Part => ({ ...part, qty: String(Math.max(Math.round((qtyOf(part) + delta) * 100) / 100, 0)) });

/** QA4: a stock line on an invoice. applied=false means it is only pending (stock not moved until the invoice saves). */
export type StockLine = { partId: string; qty: number; applied?: boolean };
/** Takes pending lines out of stock (once) and returns the list marked applied. Old lines (no flag) were already taken. */
export function commitStock<T extends StockLine>(lines: T[], store: { read: () => Part[]; upsert: (part: Part) => Part[] } = inventory): T[] {
  for (const line of lines) {
    if (line.applied !== false) continue;
    const part = store.read().find((item) => item.id === line.partId);
    if (part) store.upsert(adjust(part, -line.qty));
  }
  return lines.map((line) => ({ ...line, applied: true }));
}
