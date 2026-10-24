/**
 * Card-checkout tip (customer portal / approve page). The tip is charged as its own Stripe line, never part of
 * the invoice total, balance or sales tax, and is recorded as payment.tip on the Stripe payment row.
 */
export type TipChoice = { kind: "none" } | { kind: "percent"; percent: number } | { kind: "custom"; dollars: string };
export const TIP_PERCENTS = [10, 15, 20] as const;
const MAX_TIP_CENTS = 500_000;

/** Tip in integer cents for a charge (cents). Percent is of the amount being paid now. Capped at the charge and $5,000. */
export function tipCents(chargeCents: number, choice: unknown): number {
  const c = (choice || {}) as { kind?: unknown; percent?: unknown; dollars?: unknown };
  let cents = 0;
  if (c.kind === "percent" && TIP_PERCENTS.includes(Number(c.percent) as 10)) cents = Math.round((chargeCents * Number(c.percent)) / 100);
  else if (c.kind === "custom") {
    const v = Number(String(c.dollars ?? "").replace(/[^0-9.]/g, ""));
    cents = Number.isFinite(v) ? Math.round(v * 100) : 0;
  }
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.min(cents, Math.max(0, chargeCents), MAX_TIP_CENTS);
}
