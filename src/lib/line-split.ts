import { amountOf } from "@/lib/discount";

/** Customer-facing type of a billed line item. Not related to owner job costs (data.jobCosts). */
export type LineCategory = "labor" | "materials";

export function normalizeCategory(value: unknown): LineCategory | undefined {
  return value === "labor" || value === "materials" ? value : undefined;
}

/**
 * Billed amounts by type, before discount and tax. Returns null when no item is tagged,
 * so untagged (and older) invoices show no split.
 */
export function lineSplit(items: { qty?: unknown; rate?: unknown; category?: unknown }[]) {
  let labor = 0;
  let materials = 0;
  let other = 0;
  let tagged = false;
  for (const item of items) {
    const amount = amountOf(item.qty) * amountOf(item.rate);
    const category = normalizeCategory(item.category);
    if (category) tagged = true;
    if (category === "labor") labor += amount;
    else if (category === "materials") materials += amount;
    else other += amount;
  }
  return tagged ? { labor, materials, other } : null;
}
