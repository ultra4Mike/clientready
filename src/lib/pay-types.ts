/**
 * Per-employee pay types (owner sets them on Team). Pure: no storage, no network.
 * Default = "hourly" (clocked/typed hours x rate), so existing pay never changes.
 *  - hourly: hours on the job x rate (+ extra pay). Hours come from the clock or what the owner typed.
 *  - day:    a fixed day, paid regardless of the clock: dayRate, or dayHours x rate. Counted once per worker per day.
 *  - job:    a set amount per job.
 * Overtime (off by default) adds (multiplier - 1) x rate for hourly hours over the weekly and/or daily limit.
 */
export type PayType = "hourly" | "day" | "job" | "shift" | "salary";
export type PaySettings = {
  type: PayType;
  /** day: under this many worked hours pays half the day (blank = off, old behavior). */
  halfDayHours?: string;
  /** shift: set shift length (4/8/10/custom) paid at the hourly rate. */
  shiftHours?: string;
  /** shift: a day shorter than this pays actual hours, never a full shift (default = half the shift). */
  shiftMinHours?: string;
  /** salary: weekly amount. Spread across jobs for job costing only; counted once per week in pay totals. */
  salaryWeekly?: string;
  /** salary: first day this pay applies (hire / pay start, YYYY-MM-DD). Weeks before it never owe salary. */
  payStart?: string;
  /** Optional drive-time rate (blank = same as the work rate). */
  travelRate?: string;
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
  const type: PayType = value.type === "day" || value.type === "job" || value.type === "shift" || value.type === "salary" ? value.type : "hourly";
  const ot = value.overtime && typeof value.overtime === "object" ? value.overtime : undefined;
  return {
    type,
    ...(value.dayHours ? { dayHours: String(value.dayHours) } : {}),
    ...(value.dayRate ? { dayRate: String(value.dayRate) } : {}),
    ...(value.jobAmount ? { jobAmount: String(value.jobAmount) } : {}),
    ...(value.halfDayHours ? { halfDayHours: String(value.halfDayHours) } : {}),
    ...(value.shiftHours ? { shiftHours: String(value.shiftHours) } : {}),
    ...(value.shiftMinHours ? { shiftMinHours: String(value.shiftMinHours) } : {}),
    ...(value.salaryWeekly ? { salaryWeekly: String(value.salaryWeekly) } : {}),
    ...(value.payStart && /^\d{4}-\d{2}-\d{2}$/.test(String(value.payStart)) ? { payStart: String(value.payStart) } : {}),
    ...(value.travelRate ? { travelRate: String(value.travelRate) } : {}),
    ...(ot ? { overtime: { on: Boolean(ot.on), weekly: String(ot.weekly ?? "40"), daily: String(ot.daily ?? ""), multiplier: String(ot.multiplier ?? "1.5") } } : {}),
  };
}

/** Problems with the settings the owner typed ("" when fine). */
export function payProblem(pay: PaySettings, rate: string) {
  if (pay.type === "day" && !(num(pay.dayRate) > 0) && !(num(pay.dayHours) > 0 && num(rate) > 0)) return "A fixed day needs a day rate, or hours per day plus the hourly rate.";
  if (pay.type === "job" && !(num(pay.jobAmount) > 0)) return "Per-job pay needs an amount.";
  if (pay.type === "shift" && !(num(pay.shiftHours) > 0 && num(rate) > 0)) return "A set shift needs shift hours and the hourly rate.";
  if (pay.type === "salary" && !(num(pay.salaryWeekly) > 0)) return "Salary needs a weekly amount.";
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
  /** "timesheet": base pay is this job's share of the approved (or estimated) day timesheet (lib/timesheet-pay). */
  paySource?: "timesheet";
  timesheetPay?: string;
  timesheetApproved?: boolean;
};

/** Hours used for an hourly row: exact clocked minutes when the hours came from the clock (R55). */
export function rowHours(row: PayRow) {
  return row.hoursFromClock && row.clockMinutes ? row.clockMinutes / 60 : num(row.hours);
}

/** Pay for one crew row on one job, unrounded (round once at the money step). */
export function rowPayExact(row: PayRow) {
  const extra = num(row.bonus || "");
  if (String(row.payOverride ?? "").trim() !== "") return num(row.payOverride) + extra;
  // From the cutover on: the job's share of the day timesheet (already includes drive, overtime, salary, day rules).
  if (row.paySource === "timesheet" && row.timesheetPay !== undefined) return num(row.timesheetPay) + extra;
  if (row.payType === "job") return num(row.fixedPay) + extra;
  if (row.payType === "day") return (row.dayCounted ? 0 : num(row.fixedPay)) + extra;
  // salary: fixedPay = hourly equivalent (weekly / 40) for job costing only; week pay totals use weekPay once.
  if (row.payType === "salary") return rowHours(row) * num(row.fixedPay) + extra;
  return rowHours(row) * num(row.rate) + extra;
}
export const rowPayMoney = (row: PayRow) => cents(rowPayExact(row));

/** Snapshot fields to store on a crew row when a worker is added to a job. */
export function paySnapshot(pay: PaySettings, rate: string): Pick<PayRow, "payType" | "fixedPay"> {
  if (pay.type === "job") return { payType: "job", fixedPay: String(num(pay.jobAmount)) };
  if (pay.type === "day") return { payType: "day", fixedPay: String(cents(dayPay(pay, rate))) };
  if (pay.type === "salary") return { payType: "salary", fixedPay: String(cents(num(pay.salaryWeekly) / 40)) };
  // shift: the job's cost is its hours x the hourly rate (the shift minimum is a day rule, see dayBasePay).
  return {};
}

/** A fixed day is paid once per worker per day: later rows that day get dayCounted. Input order = priority. */
export function dayPayOnce<T extends PayRow & { employeeId: string; date: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (row.payType !== "day" || isTimesheetRow(row) || String(row.payOverride ?? "").trim() !== "") return row;
    const key = `${row.employeeId}|${row.date}`;
    if (seen.has(key)) return { ...row, dayCounted: true };
    seen.add(key);
    return { ...row, dayCounted: false };
  });
}

/** Monday-start week key (Mon-Sun, same as Period views, timesheet CSV and overtime) for a YYYY-MM-DD date. */
export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
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

/** Hours under which a set shift pays actual hours (default: half the shift). */
export function shiftMinHours(pay: PaySettings) {
  return num(pay.shiftMinHours) > 0 ? num(pay.shiftMinHours) : num(pay.shiftHours) / 2;
}

/**
 * One worker's base pay for ONE DAY from the day timesheet (work + paid drive minutes). Bonus/override stay per job.
 *  - hourly: work h x rate + drive h x (travel rate or rate)
 *  - shift:  worked >= min hours -> shiftHours x rate; shorter day -> actual hours (never a full shift for a short day)
 *  - day:    day pay; with a half-day rule, a day under halfDayHours pays half
 *  - job:    0 here (paid per job on the rows)
 *  - salary: 0 here (paid once per week by salaryWeekly)
 */
export function dayBasePay(pay: PaySettings, rate: string, workMinutes: number, driveMinutes: number) {
  const r = num(rate), tr = num(pay.travelRate) > 0 ? num(pay.travelRate) : r;
  const hours = (workMinutes + driveMinutes) / 60;
  if (pay.type === "hourly") return (workMinutes / 60) * r + (driveMinutes / 60) * tr;
  if (pay.type === "shift") return hours >= shiftMinHours(pay) ? num(pay.shiftHours) * r : (workMinutes / 60) * r + (driveMinutes / 60) * tr;
  if (pay.type === "day") {
    const full = dayPay(pay, rate);
    return num(pay.halfDayHours) > 0 && hours < num(pay.halfDayHours) ? full / 2 : full;
  }
  return 0;
}

/**
 * Week pay for one worker from his day sheets (counted once). Overtime past the weekly/daily limit applies to
 * hourly and shift pay via overtimePremium; with a travel rate the regular rate is the weighted average
 * (total straight-time pay / total hours) for that day.
 */
export function weekPay(days: { date: string; workMinutes: number; driveMinutes: number }[], pay: PaySettings, rate: string) {
  let base = 0;
  const entries: { date: string; hours: number; rate: number }[] = [];
  for (const day of days) {
    const b = dayBasePay(pay, rate, day.workMinutes, day.driveMinutes);
    base += b;
    const hours = (day.workMinutes + day.driveMinutes) / 60;
    if ((pay.type === "hourly" || pay.type === "shift") && hours > 0) entries.push({ date: day.date, hours, rate: b / hours });
  }
  if (pay.type === "salary") base = num(pay.salaryWeekly);
  const ot = overtimePremium(entries, pay);
  return { base: cents(base), overtimeHours: ot.hours, premium: ot.premium, total: cents(base + ot.premium) };
}

/** Salary share of one job for costing only: weekly amount x this job's minutes / all his minutes that week. */
export function salaryJobCost(pay: PaySettings, jobMinutesThisWeek: number, allMinutesThisWeek: number) {
  if (pay.type !== "salary" || !(allMinutesThisWeek > 0)) return 0;
  return cents(num(pay.salaryWeekly) * (jobMinutesThisWeek / allMinutesThisWeek));
}

export function payLabel(pay: PaySettings, rate: string) {
  if (pay.type === "shift") return `${num(pay.shiftHours)} h shift · $${num(rate).toFixed(2)}/hr`;
  if (pay.type === "salary") return `$${num(pay.salaryWeekly).toFixed(2)}/week salary`;
  if (pay.type === "job") return `$${num(pay.jobAmount).toFixed(2)}/job`;
  if (pay.type === "day") return `$${dayPay(pay, rate).toFixed(2)}/day`;
  return `$${num(rate).toFixed(2)}/hr`;
}

/** A row paid from the day timesheet (its share is final money; no per-row overtime/salary/day-once adjustments). */
export const isTimesheetRow = (row: PayRow) => row.paySource === "timesheet" && row.timesheetPay !== undefined && String(row.payOverride ?? "").trim() === "";
