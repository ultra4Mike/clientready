/**
 * One per-job profit breakdown (owner only), used by the invoice, Reports > Profit by job and the Year packet.
 * Price minus: materials/supplies, gas, crew pay, meals, other fees, card fees (estimated) and mileage.
 * Simple rules, no settings:
 * - Crew pay is the job's labor (hours × rate + bonus, or the labor box when there is no crew).
 * - Card fees: 2.9% + 30¢ on each payment made by card (Card (Stripe) or Credit/debit card), labeled "est.".
 * - Mileage: miles on the job × the IRS business rate, only when no gas cost was entered (never both).
 */
const money = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const CARD_FEE = { percent: 2.9, fixed: 0.3 };

/** IRS business rate (dollars per mile) for the day the miles were driven. */
export function irsMileageRate(ymd = "") {
  const day = String(ymd).slice(0, 10);
  if (day >= "2026-07-01") return 0.76;
  if (day >= "2026-01-01") return 0.725;
  if (day >= "2025-01-01") return 0.7;
  if (day >= "2024-01-01") return 0.67;
  return day ? 0.655 : 0.76;
}

export type ProfitLine = { key: string; label: string; amount: number };
export type JobProfit = { total: number; lines: ProfitLine[]; cost: number; profit: number; margin: number | null };

export function isCardMethod(method: unknown) {
  return /card|stripe/i.test(String(method || ""));
}

export function jobProfit(input: { total: number; data: Record<string, unknown> }): JobProfit {
  const data = input.data || {};
  const costs = (data.jobCosts || {}) as Record<string, unknown>;
  const fees = Array.isArray(costs.otherFees) ? (costs.otherFees as { amount?: unknown }[]) : [];
  const payments = Array.isArray(data.payments) ? (data.payments as { amount?: unknown; method?: unknown }[]) : [];
  const cardFees = payments.filter((p) => money(p.amount) > 0 && isCardMethod(p.method)).reduce((sum, p) => sum + money(p.amount) * CARD_FEE.percent / 100 + CARD_FEE.fixed, 0);
  const gas = money(costs.gas);
  const miles = money(data.jobMiles);
  const day = String(((data.schedule || {}) as { date?: unknown }).date || data.invoiceDate || "");
  const mileage = gas > 0 ? 0 : miles * irsMileageRate(day);
  const lines: ProfitLine[] = [
    { key: "materials", label: "Materials and supplies", amount: money(costs.parts) + money(costs.tools) },
    { key: "gas", label: "Gas", amount: gas },
    { key: "crew", label: "Crew pay", amount: money(costs.labor) },
    { key: "meals", label: "Meals", amount: money(costs.lunch) },
    { key: "fees", label: "Other fees", amount: fees.reduce((sum, fee) => sum + money(fee.amount), 0) },
    { key: "card", label: "Card fees (est. 2.9% + 30¢)", amount: cardFees },
    { key: "mileage", label: `Mileage (${miles} mi × $${irsMileageRate(day).toFixed(3).replace(/0$/, "")})`, amount: mileage },
  ].map((line) => ({ ...line, amount: r2(line.amount) })).filter((line) => line.amount > 0);
  const cost = r2(lines.reduce((sum, line) => sum + line.amount, 0));
  const profit = r2(input.total - cost);
  return { total: r2(input.total), lines, cost, profit, margin: input.total > 0 ? Math.round((profit / input.total) * 100) : null };
}
