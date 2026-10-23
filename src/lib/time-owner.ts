/**
 * Owner-side read model for time tracking, shared by Dashboard (Needs attention), Calendar (scheduled vs clocked)
 * and Reports (labor hours/cost). Every number comes from the same engine + approvals the Timesheet uses
 * (weekSheets / weekShares), so OT, DT, break premium, edits and approvals agree on every screen.
 * Read-only: never writes docs (the Timesheet / refreshTimesheetPay do that).
 */
import { readWorkers, type Worker } from "@/lib/schedule";
import { weekOf } from "@/lib/pay-types";
import { loadOwnerTimesheet, type DayApproval } from "@/lib/day-events";
import { reviewCount, timeAlerts, whosOnClock, type DaySheet, type FixRequest, type OnClock, type ScheduledJob, type TapEvent, type TimeAlert, type TimesheetSettings } from "@/lib/timesheet";
import { addDays, readDocs, scheduleFor, weekShares, weekSheets } from "@/lib/timesheet-sync";
import type { DayPay } from "@/lib/timesheet-pay";

export const localYmd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type TimeWeek = {
  week: string; days: string[]; workers: Worker[]; events: TapEvent[]; fixes: FixRequest[]; approvals: DayApproval[]; settings: TimesheetSettings;
  sheets: Map<string, DaySheet>; pays: Map<string, DayPay[]>; schedule: Map<string, ScheduledJob[]>;
};

/** The paid minutes the Timesheet shows for a day: edited > approved > engine estimate. */
export function dayMinutes(w: Pick<TimeWeek, "approvals" | "sheets">, employeeId: string, date: string) {
  const a = w.approvals.find((x) => x.employeeId === employeeId && x.date === date);
  const s = w.sheets.get(`${employeeId}|${date}`);
  return a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : s?.paidMinutes || 0;
}

export async function loadTimeWeek(date: string, now = new Date().toISOString()): Promise<TimeWeek> {
  const week = weekOf(date);
  const data = await loadOwnerTimesheet(week, addDays(week, 6));
  const workers = readWorkers(); const docs = readDocs();
  const { days, sheets } = weekSheets({ workers, docs, events: data.events, fixes: data.fixes, settings: data.settings, week, now });
  const { pays } = weekShares({ workers, docs, days, sheets, approvals: data.approvals, settings: data.settings });
  const schedule = new Map<string, ScheduledJob[]>();
  for (const w of workers) for (const d of days) { const s = scheduleFor(docs, w.id, d); if (s.length) schedule.set(`${w.id}|${d}`, s); }
  return { week, days, workers, events: data.events, fixes: data.fixes, approvals: data.approvals, settings: data.settings, sheets, pays, schedule };
}

export type TimeAttention = { onClock: (OnClock & { name: string })[]; alerts: (TimeAlert & { name: string })[]; pendingFixes: number; missingClockOuts: number; missedBreaks: number; noShows: number; lateStarts: number; needsReview: number };
export function timeAttention(w: TimeWeek, now = new Date().toISOString()): TimeAttention {
  const today = localYmd(new Date(now));
  const name = (id: string) => w.workers.find((x) => x.id === id)?.name || "Worker";
  const approved = (id: string, date: string) => Boolean(w.approvals.find((a) => a.employeeId === id && a.date === date)?.approvedAt);
  const alerts = timeAlerts({ sheets: w.sheets, fixes: w.fixes, events: w.events, today, schedule: w.schedule, now })
    .filter((a) => a.kind === "fix_pending" || a.kind === "late_start" || a.kind === "no_show" || !approved(a.employeeId, a.date))
    .map((a) => ({ ...a, name: name(a.employeeId) }));
  return {
    onClock: whosOnClock(w.events, today).map((o) => ({ ...o, name: name(o.employeeId) })),
    alerts,
    pendingFixes: w.fixes.filter((f) => f.status === "pending").length,
    missingClockOuts: alerts.filter((a) => a.kind === "forgot_end").length,
    missedBreaks: alerts.filter((a) => a.kind === "break_rule").length,
    noShows: alerts.filter((a) => a.kind === "no_show").length,
    lateStarts: alerts.filter((a) => a.kind === "late_start").length,
    needsReview: reviewCount(w.workers.map((x) => x.id), w.days, w.sheets, w.approvals),
  };
}

/** Labor rows (worker × day × job) for reports: hours and cost from the same approved-timesheet day pay. */
export type LaborRow = { employeeId: string; name: string; date: string; week: string; docId: string; minutes: number; cents: number; otHours: number; dtHours: number; premiumCents: number; approved: boolean; topUpCents?: number; prevailingTopUpCents?: number; ptoHours?: number };
export function laborRows(w: TimeWeek): LaborRow[] {
  const out: LaborRow[] = [];
  for (const worker of w.workers) for (const day of w.pays.get(worker.id) || []) {
    const totalMin = day.shares.reduce((s, x) => s + x.minutes, 0) || 1;
    for (const s of day.shares) {
      const f = s.minutes / totalMin;
      out.push({ employeeId: worker.id, name: worker.name, date: day.date, week: w.week, docId: s.docId, minutes: s.minutes, cents: s.cents, otHours: (day.otHours || 0) * f, dtHours: (day.dtHours || 0) * f, premiumCents: Math.round((day.premiumCents || 0) * f), approved: day.approved, topUpCents: Math.round((day.topUpCents || 0) * f), prevailingTopUpCents: Math.round((day.prevailingTopUpCents || 0) * f) });
    }
    if (!day.shares.length && day.cents) out.push({ employeeId: worker.id, name: worker.name, date: day.date, week: w.week, docId: "", minutes: day.workMinutes + day.driveMinutes, cents: day.cents, otHours: day.otHours || 0, dtHours: day.dtHours || 0, premiumCents: day.premiumCents || 0, approved: day.approved, topUpCents: day.topUpCents || 0, prevailingTopUpCents: day.prevailingTopUpCents || 0 });
  }
  return out;
}
