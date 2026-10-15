export type DiscountType = "percent" | "amount";

function num(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

export function normalizeDiscountType(value: unknown): DiscountType {
  return value === "amount" ? "amount" : "percent";
}

/** Discount in dollars, applied to the subtotal before tax. Never negative, never more than the subtotal. */
export function discountAmount(subtotal: number, type: unknown, value: unknown) {
  const raw = num(value);
  if (subtotal <= 0 || raw <= 0) return 0;
  const amount = normalizeDiscountType(type) === "amount" ? raw : subtotal * (Math.min(raw, 100) / 100);
  return Math.round(Math.min(amount, subtotal) * 100) / 100;
}

/** Totals for a document. Documents saved without discount fields get no discount. */
export function documentTotals(subtotal: number, taxPercent: unknown, type?: unknown, value?: unknown) {
  const discount = discountAmount(subtotal, type, value);
  const taxable = subtotal - discount;
  const tax = taxable * (num(taxPercent) / 100);
  return { subtotal, discount, taxable, tax, total: taxable + tax };
}

export function discountLabel(type: unknown, value: unknown) {
  const raw = num(value);
  return normalizeDiscountType(type) === "percent" ? `Discount (${raw}%)` : "Discount";
}
