/**
 * Late fees are only ever SUGGESTED. The owner sets a flat amount or a percent of the unpaid balance and
 * a number of grace days after the due date (profile). The invoice page shows the suggestion; nothing
 * is added unless the owner taps "Add late fee", which appends a separate line item to the form (all
 * existing lines, payments and totals fields stay as they were) for the owner to review and save.
 */
export type LateFeeSettings = { type: "off" | "flat" | "percent"; value: string; graceDays: string };

export const LATE_FEE_PREFIX = "Late fee";

export function readLateFeeSettings(profile: Record<string, unknown> | null | undefined): LateFeeSettings {
  const type = profile?.lateFeeType === "flat" || profile?.lateFeeType === "percent" ? profile.lateFeeType : "off";
  return { type, value: String(profile?.lateFeeValue ?? ""), graceDays: String(profile?.lateFeeGraceDays ?? "0") };
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

/** True when one of the lines is already a late fee (so it isn't suggested twice). */
export function hasLateFeeLine(items: { description?: string }[]) {
  return items.some((item) => String(item.description || "").trim().startsWith(LATE_FEE_PREFIX));
}

/**
 * The suggested late fee for an invoice, or null. Needs: settings on, a sent/overdue invoice with a
 * due date, money still owed, more than `graceDays` days past due, and no late fee line yet.
 */
export function suggestedLateFee(input: {
  settings: LateFeeSettings;
  status: string;
  dueDate: string;
  balance: number;
  items: { description?: string }[];
  today: string;
}) {
  const { settings, status, dueDate, balance, items, today } = input;
  if (settings.type === "off" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  if (status === "draft" || status === "paid" || !(balance > 0.004) || hasLateFeeLine(items)) return null;
  const daysLate = daysBetween(dueDate, today);
  const grace = Math.max(0, Math.floor(money(settings.graceDays)));
  if (daysLate <= grace) return null;
  const value = money(settings.value);
  const amount = Math.round((settings.type === "flat" ? value : (balance * value) / 100) * 100) / 100;
  if (!(amount > 0)) return null;
  const how = settings.type === "flat" ? `flat $${value.toFixed(2)}` : `${value}% of $${balance.toFixed(2)} unpaid`;
  return { amount, daysLate, description: `${LATE_FEE_PREFIX} (${daysLate} day${daysLate === 1 ? "" : "s"} past due)`, how };
}
