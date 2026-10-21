/**
 * Per-employee pay types (owner sets them on Team). Pure: no storage, no network.
 * Default = "hourly" (clocked/typed hours x rate), so existing pay never changes.
 *  - hourly: hours on the job x rate (+ extra pay). Hours come from the clock or what the owner typed.
 *  - day:    a fixed day, paid regardless of the clock: dayRate, or dayHours x rate. Counted once per worker per day.
 *  - job:    a set amount per job.
 * Overtime (off by default) adds (multiplier - 1) x rate for hourly hours over the weekly and/or daily limit.
 */
export type PayType = "hourly" | "day" | "job";
export type PaySettings = {
  type: PayType;
  dayHours?: string;
  dayRate?: string;
  jobAmount?: string;
  overtime?: { on: boolean; weekly?: string; daily?: string; multiplier?: string };
};
export const DEFAULT_PAY: PaySettings = { type: "hourly" };

const num = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const cents = (value: number) => Math.round(value * 100) / 100;

export function readPaySettings(raw: unknown): PaySettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<PaySettings>;
  const type: PayType = value.type === "day" || value.type === "job" ? value.type : "hourly";
  const ot = value.overtime && typeof value.overtime === "object" ? value.overtime : undefined;
  return {
    type,
    ...(value.dayHours ? { dayHours: String(value.dayHours) } : {}),
    ...(value.dayRate ? { dayRate: String(value.dayRate) } : {}),
    ...(value.jobAmount ? { jobAmount: String(value.jobAmount) } : {}),
    ...(ot ? { overtime: { on: Boolean(ot.on), weekly: String(ot.weekly ?? "40"), daily: String(ot.daily ?? ""), multiplier: String(ot.multiplier ?? "1.5") } } : {}),
  };
}

/** Problems with the settings the owner typed ("" when fine). */
export function payProblem(pay: PaySettings, rate: string) {
  if (pay.type === "day" && !(num(pay.dayRate) > 0) && !(num(pay.dayHours) > 0 && num(rate) > 0)) return "A fixed day needs a day rate, or hours per day plus the hourly rate.";
  if (pay.type === "job" && !(num(pay.jobAmount) > 0)) return "Per-job pay needs an amount.";
  if (pay.overtime?.on) {
    if (!(num(pay.overtime.weekly) > 0) && !(num(pay.overtime.daily) > 0)) return "Overtime needs a weekly or daily limit.";
    if (!(num(pay.overtime.multiplier) >= 1)) return "Overtime multiplier must be 1 or more (e.g. 1.5).";
  }
  return "";
}

/** Base pay of a fixed day (dayRate wins over dayHours x rate). */
export function dayPay(pay: PaySettings, rate: string) {
  return num(pay.dayRate) > 0 ? num(pay.dayRate) : num(pay.dayHours) * num(rate);
}

export type PayRow = {
  rate?: string;
  hours?: string;
  bonus?: string;
  hoursFromClock?: boolean;
  clockMinutes?: number;
  /** Snapshot of the worker's pay type when added to the job (missing = hourly). */
  payType?: PayType;
  /** Snapshot of the fixed amount (day or job) for payType day/job. */
  fixedPay?: string;
  /** Owner override for this job: replaces the computed base pay. */
  payOverride?: string;
  /** Day pay already counted on another job that day (set by dayPayOnce). */
  dayCounted?: boolean;
};

/** Hours used for an hourly row: exact clocked minutes when the hours came from the clock (R55). */
export function rowHours(row: PayRow) {
  return row.hoursFromClock && row.clockMinutes ? row.clockMinutes / 60 : num(row.hours);
}

/** Pay for one crew row on one job, unrounded (round once at the money step). */
export function rowPayExact(row: PayRow) {
  const extra = num(row.bonus || "");
  if (String(row.payOverride ?? "").trim() !== "") return num(row.payOverride) + extra;
  if (row.payType === "job") return num(row.fixedPay) + extra;
  if (row.payType === "day") return (row.dayCounted ? 0 : num(row.fixedPay)) + extra;
  return rowHours(row) * num(row.rate) + extra;
}
export const rowPayMoney = (row: PayRow) => cents(rowPayExact(row));

/** Snapshot fields to store on a crew row when a worker is added to a job. */
export function paySnapshot(pay: PaySettings, rate: string): Pick<PayRow, "payType" | "fixedPay"> {
  if (pay.type === "job") return { payType: "job", fixedPay: String(num(pay.jobAmount)) };
  if (pay.type === "day") return { payType: "day", fixedPay: String(cents(dayPay(pay, rate))) };
  return {};
}

/** A fixed day is paid once per worker per day: later rows that day get dayCounted. Input order = priority. */
export function dayPayOnce<T extends PayRow & { employeeId: string; date: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (row.payType !== "day" || String(row.payOverride ?? "").trim() !== "") return row;
    const key = `${row.employeeId}|${row.date}`;
    if (seen.has(key)) return { ...row, dayCounted: true };
    seen.add(key);
    return { ...row, dayCounted: false };
  });
}

/** Sunday-start week key for a YYYY-MM-DD date. */
export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/**
 * Overtime premium for one worker: entries are hourly rows (date, hours, rate). Daily excess counts first,
 * then weekly excess beyond what was already overtime. Premium = (multiplier - 1) x rate x overtime hours.
 */
export function overtimePremium(entries: { date: string; hours: number; rate: number }[], pay: PaySettings) {
  const ot = pay.overtime;
  if (!ot?.on) return { hours: 0, premium: 0 };
  const weekly = num(ot.weekly), daily = num(ot.daily), extra = Math.max(0, num(ot.multiplier || "1.5") - 1);
  let hours = 0, premium = 0;
  const sorted = [...entries].filter((entry) => entry.hours > 0).sort((a, b) => a.date.localeCompare(b.date));
  const dayUsed = new Map<string, number>(), weekRegular = new Map<string, number>();
  for (const entry of sorted) {
    const used = dayUsed.get(entry.date) || 0;
    const dailyOt = daily > 0 ? Math.max(0, used + entry.hours - Math.max(daily, used)) : 0;
    dayUsed.set(entry.date, used + entry.hours);
    let regular = entry.hours - dailyOt;
    const week = weekOf(entry.date);
    const before = weekRegular.get(week) || 0;
    const weeklyOt = weekly > 0 ? Math.max(0, before + regular - Math.max(weekly, before)) : 0;
    regular -= weeklyOt;
    weekRegular.set(week, before + regular);
    const over = dailyOt + weeklyOt;
    hours += over;
    premium += over * entry.rate * extra;
  }
  return { hours: Math.round(hours * 100) / 100, premium: cents(premium) };
}

export function payLabel(pay: PaySettings, rate: string) {
  if (pay.type === "job") return `$${num(pay.jobAmount).toFixed(2)}/job`;
  if (pay.type === "day") return `$${dayPay(pay, rate).toFixed(2)}/day`;
  return `$${num(rate).toFixed(2)}/hr`;
}
