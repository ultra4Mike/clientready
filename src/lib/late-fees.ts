/**
 * Late fees are only ever SUGGESTED. The owner sets a flat amount or a percent of the unpaid balance and
 * a number of grace days after the due date (profile). The invoice page shows the suggestion; nothing
 * is added unless the owner taps "Add late fee", which appends a separate line item to the form (all
 * existing lines, payments and totals fields stay as they were) for the owner to review and save.
 */
export type LateFeeSettings = {
  type: "off" | "flat" | "percent";
  value: string;
  graceDays: string;
  /** Optional rules (blank = no rule): cap on all late fees on one invoice, skip small balances, add again every N days. */
  max?: string;
  minBalance?: string;
  repeatDays?: string;
};

export const LATE_FEE_PREFIX = "Late fee";

export function readLateFeeSettings(profile: Record<string, unknown> | null | undefined): LateFeeSettings {
  const type = profile?.lateFeeType === "flat" || profile?.lateFeeType === "percent" ? profile.lateFeeType : "off";
  return {
    type,
    value: String(profile?.lateFeeValue ?? ""),
    graceDays: String(profile?.lateFeeGraceDays ?? "0"),
    max: String(profile?.lateFeeMax ?? ""),
    minBalance: String(profile?.lateFeeMinBalance ?? ""),
    repeatDays: String(profile?.lateFeeRepeatDays ?? ""),
  };
}

/** profiles.late_fee_rules (jsonb) -> profile fields. */
export function lateFeeRulesFromRow(rules: unknown) {
  const r = rules && typeof rules === "object" ? (rules as Record<string, unknown>) : {};
  return { lateFeeMax: String(r.max ?? ""), lateFeeMinBalance: String(r.minBalance ?? ""), lateFeeRepeatDays: String(r.repeatDays ?? "") };
}

export function lateFeeRulesToRow(profile: { lateFeeMax?: string; lateFeeMinBalance?: string; lateFeeRepeatDays?: string }) {
  return { max: String(profile.lateFeeMax || "").slice(0, 20), minBalance: String(profile.lateFeeMinBalance || "").slice(0, 20), repeatDays: String(profile.lateFeeRepeatDays || "").slice(0, 5) };
}

const money = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function daysBetween(fromYmd: string, toYmd: string) {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  return Number.isNaN(from) || Number.isNaN(to) ? 0 : Math.round((to - from) / 86400000);
}

type Line = { description?: string; qty?: unknown; rate?: unknown };
const isFee = (item: Line) => String(item.description || "").trim().startsWith(LATE_FEE_PREFIX);

/** True when one of the lines is already a late fee. */
export function hasLateFeeLine(items: Line[]) {
  return items.some(isFee);
}

/** Late fee lines already on the invoice: how many and their total. */
export function existingLateFees(items: Line[]) {
  const fees = items.filter(isFee);
  return { count: fees.length, total: Math.round(fees.reduce((sum, item) => sum + money(item.qty || 1) * money(item.rate), 0) * 100) / 100 };
}

/**
 * The suggested late fee for an invoice, or null. Needs: settings on, a sent/overdue invoice with a
 * due date, money still owed (at least `minBalance` before late fees), more than `graceDays` days past
 * due, and not skipped for this invoice. The first fee comes after the grace days; with `repeatDays`
 * another is suggested every N days after that, else only one. All fees together stay under `max`.
 * A percent fee is worked out on the unpaid balance without earlier late fees.
 */
export function suggestedLateFee(input: {
  settings: LateFeeSettings;
  status: string;
  dueDate: string;
  balance: number;
  items: Line[];
  today: string;
  skip?: boolean;
}) {
  const { settings, status, dueDate, balance, items, today } = input;
  if (input.skip || settings.type === "off" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  if (status === "draft" || status === "paid" || !(balance > 0.004)) return null;
  const earlier = existingLateFees(items);
  const base = Math.max(0, Math.round((balance - earlier.total) * 100) / 100);
  const minBalance = money(settings.minBalance);
  if (minBalance > 0 && base < minBalance) return null;
  const daysLate = daysBetween(dueDate, today);
  const grace = Math.max(0, Math.floor(money(settings.graceDays)));
  const repeat = Math.max(0, Math.floor(money(settings.repeatDays)));
  if (earlier.count > 0 && !repeat) return null;
  if (daysLate <= grace + earlier.count * repeat) return null;
  const value = money(settings.value);
  let amount = Math.round((settings.type === "flat" ? value : (base * value) / 100) * 100) / 100;
  const max = money(settings.max);
  let capped = false;
  if (max > 0 && earlier.total + amount > max) { amount = Math.round((max - earlier.total) * 100) / 100; capped = true; }
  if (!(amount > 0.004)) return null;
  const how = `${settings.type === "flat" ? `flat $${value.toFixed(2)}` : `${value}% of $${base.toFixed(2)} unpaid`}${earlier.count ? `, fee ${earlier.count + 1}` : ""}${capped ? `, capped at $${max.toFixed(2)} total` : ""}`;
  return { amount, daysLate, number: earlier.count + 1, capped, description: `${LATE_FEE_PREFIX} (${daysLate} day${daysLate === 1 ? "" : "s"} past due)`, how };
}
