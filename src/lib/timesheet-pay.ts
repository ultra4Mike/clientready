/**
 * Crew pay from the APPROVED day timesheet (pure: no storage, no network).
 * From the cutover date on, a worker's pay for a day is the day engine's pay (hourly with gaps/drive, shift short-day
 * rule, day half-day rule, salary once per week, travel rate, weekly/daily overtime premium), split across that
 * day's jobs: work pay by each job's work minutes, drive pay to the job driven TO. Cents always add up exactly
 * (largest remainder). Unapproved days carry the same numbers as an estimate ("Not approved yet").
 * Days before the cutover, rows paid to the worker, rows approved on the old hours card, per-job pay and
 * rows with an override keep the old per-job pay, so past invoices, Year packet and pay sheets never move.
 */
import { dayBasePay, overtimePremium, readPaySettings, weekOf, type PayRow, type PaySettings } from "./pay-types";
import type { DaySheet, TimesheetSettings } from "./timesheet";
import { otRules, overtimeTiers } from "./overtime-rules";

const num = (value: unknown) => { const n = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };

/** Split `totalCents` by `weights` so the parts are whole cents and add up exactly (largest remainder). */
export function splitCents(totalCents: number, weights: number[]): number[] {
  const total = Math.round(totalCents);
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (!(sum > 0)) return splitCents(total, weights.map(() => 1));
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]] += 1;
  return out;
}

export type DayInput = {
  date: string;
  sheet?: DaySheet;
  /** Owner-approved (or edited) paid minutes for the day; when missing, the engine's paid minutes are the estimate. */
  approvedMinutes?: number | null;
  approved: boolean;
  /** Jobs to use when the sheet has no job spans (e.g. an edited day): equal shares. */
  fallbackDocIds?: string[];
};
export type JobShare = { date: string; docId: string; cents: number; minutes: number; dayCents: number; dayMinutes: number; approved: boolean };
/** unallocated: weekly salary with no hours that week, paid once as labor not tied to a job. */
export type DayPay = { date: string; cents: number; workMinutes: number; driveMinutes: number; approved: boolean; shares: JobShare[]; unallocated?: boolean; otHours?: number; dtHours?: number; premiumCents?: number; caPremiumHours?: number };
/** Account rules that change pay (all optional; missing = the per-worker behaviour from before phase 1). */
export type PayRules = { halfDayHours?: number; settings?: Partial<TimesheetSettings>; weekBonus?: Map<string, number> };

/** Minutes of the day after an owner edit: drive stays as logged (capped), the rest is work. */
function dayMinutes(day: DayInput) {
  const sheetTotal = day.sheet?.paidMinutes || 0;
  const total = day.approvedMinutes != null ? Math.max(0, day.approvedMinutes) : sheetTotal;
  const drive = Math.min(total, day.sheet?.driveMinutes || 0);
  return { work: total - drive, drive };
}

/**
 * One worker's week (days of ONE Monday-start week or several; weeks are handled separately).
 * Returns each day's pay in cents and its per-job shares. The cents of all days in a week add up to the week pay
 * (base + overtime premium, or the weekly salary once).
 */
export function allocateWeek(days: DayInput[], payRaw: PaySettings | unknown, rate: string, defaults: PayRules = {}): DayPay[] {
  const read = readPaySettings(payRaw);
  // The Timesheet rule "Half day under (h)" is the default when the worker has no half-day hours of his own.
  const pay: PaySettings = read.type === "day" && !(num(read.halfDayHours) > 0) && num(defaults.halfDayHours) > 0 ? { ...read, halfDayHours: String(defaults.halfDayHours) } : read;
  const byWeek = new Map<string, DayInput[]>();
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) byWeek.set(weekOf(d.date), [...(byWeek.get(weekOf(d.date)) || []), d]);
  const out: DayPay[] = [];
  for (const list of byWeek.values()) {
    const mins = list.map(dayMinutes);
    const base = list.map((_, i) => (pay.type === "salary" ? 0 : dayBasePay(pay, rate, mins[i].work, mins[i].drive)));
    // Salary: the weekly amount once, spread over the week's days by minutes.
    if (pay.type === "salary") {
      const parts = splitCents(Math.round(num(pay.salaryWeekly) * 100), mins.map((m) => m.work + m.drive));
      const allZero = mins.every((m) => m.work + m.drive <= 0);
      parts.forEach((c, i) => { base[i] = allZero ? 0 : c / 100; });
      // No hours this week: the salary is still paid once, as unallocated labor (no job to cost it to).
      if (allZero && num(pay.salaryWeekly) > 0 && list.length) {
        const all = Math.round(num(pay.salaryWeekly) * 100);
        list.forEach((d, i) => out.push({ date: d.date, cents: i === 0 ? all : 0, workMinutes: 0, driveMinutes: 0, approved: d.approved, shares: [], unallocated: i === 0 }));
        continue;
      }
    }
    // California missed meal/rest premium: an hour at the regular rate per missed break (only when the owner turned it on).
    const caHours = list.map((d) => d.sheet?.premiumHours || 0);
    // Overtime premium per day: account preset (OT / double time / 7th day, FLSA regular rate) or the worker's own rule.
    const premium: number[] = [];
    const ot: { ot: number; dt: number }[] = list.map(() => ({ ot: 0, dt: 0 }));
    const rules = defaults.settings ? otRules({ otPreset: "worker", weeklyOtHours: 40, dailyOtHours: 0, dailyDtHours: 0, seventhDayRule: false, ...defaults.settings }) : null;
    const hourlyLike = pay.type === "hourly" || pay.type === "shift";
    if (rules && hourlyLike) {
      const bonus = defaults.settings?.bonusInRegularRate === false ? 0 : defaults.weekBonus?.get(weekOf(list[0].date)) || 0;
      const res = overtimeTiers(list.map((d, i) => ({ date: d.date, hours: (mins[i].work + mins[i].drive) / 60, straight: base[i] })), rules, bonus);
      res.days.forEach((r, i) => { premium.push(r.premium); ot[i] = { ot: r.otHours, dt: r.dtHours }; });
    } else {
      const entries: { date: string; hours: number; rate: number }[] = [];
      let before = 0;
      list.forEach((d, i) => {
        const hours = (mins[i].work + mins[i].drive) / 60;
        if (hourlyLike && hours > 0) entries.push({ date: d.date, hours, rate: base[i] / hours });
        const r = overtimePremium(entries, pay);
        premium.push(r.premium - before);
        ot[i] = { ot: Math.max(0, r.hours - ot.slice(0, i).reduce((s2, x) => s2 + x.ot, 0)), dt: 0 };
        before = r.premium;
      });
    }
    list.forEach((_, i) => { if (caHours[i] > 0 && num(rate) > 0) premium[i] += caHours[i] * num(rate); });
    const exact = list.map((_, i) => base[i] + premium[i]);
    const weekCents = Math.round(exact.reduce((s, x) => s + x, 0) * 100);
    const dayCents = splitCents(weekCents, exact.map((x) => Math.max(0, x)));
    list.forEach((d, i) => {
      const cents = exact.every((x) => x <= 0) ? 0 : dayCents[i];
      out.push({ date: d.date, cents, workMinutes: mins[i].work, driveMinutes: mins[i].drive, approved: d.approved, shares: shareDay(d, cents, mins[i], pay, rate), otHours: ot[i].ot, dtHours: ot[i].dt, premiumCents: Math.round(premium[i] * 100), caPremiumHours: caHours[i] });
    });
  }
  return out;
}

/** Split one day's cents across its jobs: work pay by work minutes, drive pay to the job driven TO. */
export function shareDay(day: DayInput, cents: number, m: { work: number; drive: number }, pay: PaySettings, rate: string): JobShare[] {
  const sheet = day.sheet;
  const docIds: string[] = [];
  const add = (id?: string) => { if (id && !docIds.includes(id)) docIds.push(id); };
  sheet?.jobs.forEach((j) => add(j.docId));
  if (!docIds.length) (day.fallbackDocIds || []).forEach(add);
  if (!docIds.length) return [];
  const workW = docIds.map((id) => sheet?.jobs.filter((j) => j.docId === id).reduce((s, j) => s + j.minutes, 0) || 0);
  const driveW = docIds.map((id) => sheet?.drives.filter((d) => d.toDocId === id).reduce((s, d) => s + d.paidMinutes, 0) || 0);
  const driveTotal = driveW.reduce((s, x) => s + x, 0);
  // Share of the day's pay that is drive pay (travel rate aware for hourly / short shift days).
  const r = num(rate), tr = num(pay.travelRate) > 0 ? num(pay.travelRate) : r;
  const baseAll = dayBasePay(pay, rate, m.work, m.drive);
  const hourlyLike = pay.type === "hourly" || (pay.type === "shift" && baseAll !== num(pay.shiftHours) * r);
  let driveFrac = 0;
  if (m.drive > 0 && driveTotal > 0) driveFrac = hourlyLike && baseAll > 0 ? ((m.drive / 60) * tr) / baseAll : m.drive / (m.work + m.drive);
  const exact = docIds.map((_, i) => {
    const w = workW.reduce((s, x) => s + x, 0) > 0 ? workW[i] / workW.reduce((s, x) => s + x, 0) : 1 / docIds.length;
    const d = driveTotal > 0 ? driveW[i] / driveTotal : 0;
    return cents * ((1 - driveFrac) * w + driveFrac * d);
  });
  const parts = splitCents(cents, exact);
  const total = m.work + m.drive;
  const minuteW = docIds.map((_, i) => workW[i] + driveW[i]);
  const minSum = minuteW.reduce((s, x) => s + x, 0);
  return docIds.map((docId, i) => ({ date: day.date, docId, cents: parts[i], minutes: Math.round((minSum > 0 ? (total * minuteW[i]) / minSum : total / docIds.length) * 100) / 100, dayCents: cents, dayMinutes: total, approved: day.approved }));
}

export type TimesheetRowFields = {
  /** "timesheet" = pay comes from the day timesheet share; missing = old per-job pay (kept exactly). */
  paySource?: "timesheet";
  timesheetPay?: string;
  timesheetMinutes?: number;
  timesheetDayPay?: string;
  timesheetDayMinutes?: number;
  timesheetApproved?: boolean;
};

type Row = PayRow & TimesheetRowFields & { id?: string; employeeId?: string; workDate?: string; paidToWorker?: boolean };

/** Does this crew row follow the day timesheet? (Never for past data: before cutover, paid, old approval, per-job, override.) */
export function followsTimesheet(row: Row, cutover: string, oldApproved: boolean) {
  if (row.paySource === "timesheet") return true; // already switched over: keep following (approve/undo moves it)
  const date = String(row.workDate || "").slice(0, 10);
  if (!date || !cutover || date < cutover) return false;
  if (row.paidToWorker || oldApproved) return false;
  if (row.payType === "job") return false;
  return true;
}

/**
 * Put the timesheet shares on a job's crew rows. Returns the new rows and whether anything changed.
 * `shares`: employeeId|date -> share for THIS doc. `oldApprovals`: employee ids with an old hours-card approval.
 */
export function applySharesToCrew<T extends Row>(crew: T[], docId: string, shares: Map<string, JobShare>, cutover: string, oldApprovals: Set<string>) {
  let changed = false;
  const next = crew.map((row) => {
    const date = String(row.workDate || "").slice(0, 10);
    const share = shares.get(`${row.employeeId}|${date}`);
    if (!share || share.docId !== docId || row.paidToWorker) return row;
    if (!followsTimesheet(row, cutover, oldApprovals.has(String(row.employeeId)))) return row;
    const fields: TimesheetRowFields = {
      paySource: "timesheet", timesheetPay: (share.cents / 100).toFixed(2), timesheetMinutes: share.minutes,
      timesheetDayPay: (share.dayCents / 100).toFixed(2), timesheetDayMinutes: share.dayMinutes, timesheetApproved: share.approved,
    };
    const same = (Object.keys(fields) as (keyof TimesheetRowFields)[]).every((k) => row[k] === fields[k]);
    if (same) return row;
    changed = true;
    return { ...row, ...fields };
  });
  return { crew: next, changed };
}

const addDaysYmd = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export type UnallocatedSalaryWeek = { employeeId: string; name: string; week: string; cents: number };
type SalaryWorker = { id: string; name?: string; paySettings?: unknown; active?: boolean };
type SalaryDoc = { type?: string; data?: Record<string, unknown> | null };

/**
 * Weekly salary owed for weeks with NO hours (no job to cost it to), computed from the pay settings and the
 * calendar only, so Timesheet, Crew pay and the Year packet always agree and it is counted once per worker per week.
 * Weeks run Monday to Sunday, from the later of the timesheet pay cutover and the worker's pay start (that week
 * counts if any of its days is on/after the start) up to the week containing `today`. A week is "no hours" when no
 * non-void job has a crew row for him dated that week with hours or timesheet minutes (rows with hours are already
 * paid through the job rows and the per-week salary adjustment).
 */
export function unallocatedSalaryWeeks(input: { workers: SalaryWorker[]; docs: SalaryDoc[]; cutover: string; today: string; year?: string }): UnallocatedSalaryWeek[] {
  const out: UnallocatedSalaryWeek[] = [];
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(input.cutover || "") || !ymd.test(input.today || "")) return out;
  const worked = new Set<string>();
  for (const doc of input.docs) {
    const data = (doc?.data || {}) as Record<string, unknown>;
    if (String(data.status || "") === "void" || data.deleted === true || data.deleted === "true") continue;
    const sched = (data.schedule || {}) as { date?: string };
    for (const row of (Array.isArray(data.crew) ? data.crew : []) as (Row & { timesheetMinutes?: number })[]) {
      const date = String(row.workDate || sched.date || "").slice(0, 10);
      if (!row.employeeId || !ymd.test(date)) continue;
      if (num(row.hours) > 0 || num(row.timesheetMinutes) > 0) worked.add(`${row.employeeId}|${weekOf(date)}`);
    }
  }
  const lastWeek = weekOf(input.today);
  for (const w of input.workers) {
    const pay = readPaySettings(w.paySettings);
    const cents = Math.round(num(pay.salaryWeekly) * 100);
    if (pay.type !== "salary" || !(cents > 0)) continue;
    const start = pay.payStart && pay.payStart > input.cutover ? pay.payStart : input.cutover;
    for (let week = weekOf(start); week <= lastWeek; week = addDaysYmd(week, 7)) {
      if (input.year && !week.startsWith(input.year)) continue;
      if (worked.has(`${w.id}|${week}`)) continue;
      out.push({ employeeId: w.id, name: w.name || "Worker", week, cents });
    }
  }
  return out;
}
