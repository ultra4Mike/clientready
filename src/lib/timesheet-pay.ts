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
import type { DaySheet } from "./timesheet";

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
export type DayPay = { date: string; cents: number; workMinutes: number; driveMinutes: number; approved: boolean; shares: JobShare[] };

/** Minutes of the day after an owner edit: drive stays as logged (capped), the rest is work. */
function dayMinutes(day: DayInput) {
  const sheetTotal = day.sheet?.paidMinutes || 0;
  const total = day.approvedMinutes != null ? Math.max(0, day.approvedMinutes) : sheetTotal;
  const drive = Math.min(total, day.sheet?.driveMinutes || 0);
  return { work: total - drive, drive };
}

/**
 * One worker's week (days of ONE Sunday-start week or several; weeks are handled separately).
 * Returns each day's pay in cents and its per-job shares. The cents of all days in a week add up to the week pay
 * (base + overtime premium, or the weekly salary once).
 */
export function allocateWeek(days: DayInput[], payRaw: PaySettings | unknown, rate: string): DayPay[] {
  const pay = readPaySettings(payRaw);
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
    }
    // Overtime premium per day: cumulative premium after this day minus before (weekly + daily rules).
    const entries: { date: string; hours: number; rate: number }[] = [];
    const premium: number[] = [];
    let before = 0;
    list.forEach((d, i) => {
      const hours = (mins[i].work + mins[i].drive) / 60;
      if ((pay.type === "hourly" || pay.type === "shift") && hours > 0) entries.push({ date: d.date, hours, rate: base[i] / hours });
      const now = overtimePremium(entries, pay).premium;
      premium.push(now - before);
      before = now;
    });
    const exact = list.map((_, i) => base[i] + premium[i]);
    const weekCents = Math.round(exact.reduce((s, x) => s + x, 0) * 100);
    const dayCents = splitCents(weekCents, exact.map((x) => Math.max(0, x)));
    list.forEach((d, i) => {
      const cents = exact.every((x) => x <= 0) ? 0 : dayCents[i];
      out.push({ date: d.date, cents, workMinutes: mins[i].work, driveMinutes: mins[i].drive, approved: d.approved, shares: shareDay(d, cents, mins[i], pay, rate) });
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
