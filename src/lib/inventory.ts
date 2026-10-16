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
