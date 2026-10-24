/**
 * One per-job profit breakdown (owner only), used by the invoice, Reports > Profit by job and the Year packet.
 * Price minus: materials/supplies, gas, crew pay, meals, other fees, card fees (estimated) and mileage.
 * Simple rules, no settings:
 * - Crew pay is the job's labor (hours × rate + bonus, or the labor box when there is no crew).
 * - Card fees: 2.9% + 30¢ on each payment made by card (Card (Stripe) or Credit/debit card), labeled "est.".
 * - Refunds lower the job's revenue (not its costs).
 * - Mileage: miles on the job × the IRS business rate, only when no gas cost was entered (never both).
 */
import { jobWhen } from "./job-when";
import { rowPayMoney } from "./pay-types";
const money = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * QA4: the ONE labour number for a job, used by Profit by job, Overview job costs, Schedule C Line 11 and the labour
 * report: the sum of its crew rows' pay (same rule as the invoice and Payroll), or the labor box when it has no crew.
 */
export function jobLabour(data: Record<string, unknown>): number {
  const crew = Array.isArray(data.crew) ? (data.crew as Record<string, unknown>[]) : [];
  const costs = (data.jobCosts || {}) as Record<string, unknown>;
  if (!crew.length) return r2(money(costs.labor));
  return r2(crew.reduce((sum, row) => sum + rowPayMoney(row as never), 0));
}

/** Owner's mileage rate ($/mi, Settings) overrides the IRS rate when set. */
export const MILEAGE_RATE_KEY = "clientready-mileage-rate";
export function ownerMileageRate(): number {
  try { const v = typeof window === "undefined" ? "" : window.localStorage.getItem(MILEAGE_RATE_KEY) || ""; const n = Number(v); return n > 0 && n < 10 ? n : 0; } catch { return 0; }
}

export const CARD_FEE = { percent: 2.9, fixed: 0.3 };

/** IRS business rate (dollars per mile) for the day the miles were driven. */
export function irsMileageRate(ymd = "") {
  const own = ownerMileageRate(); if (own) return own;
  const day = String(ymd).slice(0, 10);
  if (day >= "2026-07-01") return 0.76;
  if (day >= "2026-01-01") return 0.725;
  if (day >= "2025-01-01") return 0.7;
  if (day >= "2024-01-01") return 0.67;
  return day ? 0.655 : 0.76;
}

export type ProfitLine = { key: string; label: string; amount: number };
export type JobProfit = { total: number; refunded: number; lines: ProfitLine[]; cost: number; profit: number; margin: number | null };

// R37: only real card payments (Card (Stripe), Credit/debit card, legacy "Card"/"Stripe") get the estimate.
const CARD_METHODS = new Set(["card", "stripe", "card (stripe)", "credit/debit card", "credit card", "debit card", "credit/debit"]);
export function isCardMethod(method: unknown) {
  return CARD_METHODS.has(String(method || "").trim().toLowerCase());
}
export const CARD_FEE_LINE_PREFIX = "Card processing fee";

export function jobProfit(input: { total: number; data: Record<string, unknown> }): JobProfit {
  const data = input.data || {};
  const costs = (data.jobCosts || {}) as Record<string, unknown>;
  const fees = Array.isArray(costs.otherFees) ? (costs.otherFees as { amount?: unknown }[]) : [];
  const payments = Array.isArray(data.payments) ? (data.payments as { amount?: unknown; method?: unknown }[]) : [];
  const cardFees = payments.filter((p) => money(p.amount) > 0 && isCardMethod(p.method)).reduce((sum, p) => sum + money(p.amount) * CARD_FEE.percent / 100 + CARD_FEE.fixed, 0);
  // R37/R40: a passed-through card fee line is not revenue; it offsets the estimated card fees (never counted twice).
  const items = Array.isArray(data.items) ? (data.items as { description?: unknown; qty?: unknown; rate?: unknown }[]) : [];
  const collected = items.filter((i) => String(i.description || "").startsWith(CARD_FEE_LINE_PREFIX)).reduce((sum, i) => sum + money(i.qty || 1) * money(i.rate), 0);
  // Help retest: a refund is money given back, so it lowers REVENUE (and collected), never job costs.
  // Card fees are not returned by Stripe, so they stay a cost.
  const refunded = r2(payments.filter((p) => String((p as { id?: unknown }).id || "").startsWith("refund_") && money(p.amount) < 0).reduce((sum, p) => sum - money(p.amount), 0));
  const revenue = input.total - collected - refunded;
  const netCard = Math.max(0, cardFees - collected);
  const gas = money(costs.gas);
  const miles = money(data.jobMiles);
  const day = jobWhen(data)?.date || String(data.invoiceDate || "");
  const mileage = gas > 0 ? 0 : miles * irsMileageRate(day);
  const lines: ProfitLine[] = [
    { key: "materials", label: "Materials and supplies", amount: money(costs.parts) + money(costs.tools) },
    { key: "gas", label: "Gas", amount: gas },
    { key: "crew", label: "Crew pay", amount: jobLabour(data) },
    { key: "meals", label: "Meals", amount: money(costs.lunch) },
    { key: "fees", label: "Other fees", amount: fees.reduce((sum, fee) => sum + money(fee.amount), 0) },
    { key: "card", label: collected > 0 ? `Card fees (est., after $${collected.toFixed(2)} collected)` : "Card fees (est. 2.9% + 30¢)", amount: netCard },
    { key: "mileage", label: `Mileage (${miles} mi × $${irsMileageRate(day).toFixed(3).replace(/0$/, "")})`, amount: mileage },
  ].map((line) => ({ ...line, amount: r2(line.amount) })).filter((line) => line.amount > 0);
  const cost = r2(lines.reduce((sum, line) => sum + line.amount, 0));
  // Customer paid the full total (fee line included); the business pays the full estimated card fees.
  const profit = r2(input.total - refunded - (cost - r2(netCard)) - cardFees);
  return { total: r2(revenue), refunded, lines, cost, profit, margin: revenue > 0 ? Math.round((profit / revenue) * 100) : null };
}

/**
 * QA4: Payroll total = job labour (Line 11 / Profit by job) + paid time off + overtime premium + salary not on a job.
 * Returns the gap so the Payroll tab / tests can show what does not tie out (0 when it reconciles).
 */
export function labourReconcile(parts: { payroll: number; jobLabour: number; pto?: number; otPremium?: number; unallocated?: number }) {
  const expected = r2(parts.jobLabour + (parts.pto || 0) + (parts.otPremium || 0) + (parts.unallocated || 0));
  const gap = r2(parts.payroll - expected);
  return { expected, gap, ok: Math.abs(gap) < 0.01 };
}
