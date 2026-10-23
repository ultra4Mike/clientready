// Owner-only timesheet CSV from crew clock entries. Hours only (no pay), one row per entry plus a total per worker.
import { entryHours, type ClockEntry } from "@/lib/clock";
import { readPaySettings } from "@/lib/pay-types";
import { ptoWeekOff, resolvedOvertime } from "@/lib/timesheet-pay";
import { otRules, usesAccountOvertime } from "@/lib/overtime-rules";
import type { TimesheetSettings } from "@/lib/timesheet";
import type { PtoRequest } from "@/lib/pay-phase2";
import { hhmmTz, ymdTz } from "@/lib/timesheet";

const pad = (n: number) => String(n).padStart(2, "0");
export const localYmd = (d: Date) => ymdTz(d);
const localTime = (d: Date) => hhmmTz(d.toISOString());

/** Monday..Sunday of the week containing `day`. */
export function weekRange(day = new Date()) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: localYmd(start), to: localYmd(end) };
}

export function csvCell(value: string | number) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheets from running it as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Job = { title: string; client: string };

/** `pay`: employee id -> pay settings. An "Overtime" column appears only when someone has overtime switched on. */
export function timesheetCsv(entries: ClockEntry[], from: string, to: string, names: Record<string, string>, jobs: Record<string, Job>, pay: Record<string, unknown> = {}, opts: { settings?: TimesheetSettings; pto?: PtoRequest[] } = {}) {
  const rows = entries
    .filter((e) => {
      const d = localYmd(new Date(e.started_at));
      return d >= from && d <= to;
    })
    .map((e) => {
      const start = new Date(e.started_at);
      const end = e.ended_at ? new Date(e.ended_at) : null;
      const worker = names[e.employee_id] || e.worker_name || e.worker_email || "Unknown";
      const job = jobs[e.doc_id] || { title: e.doc_id, client: "" };
      return { id: e.employee_id, worker, date: localYmd(start), start, end, job, hours: end ? entryHours(e) : null, edited: e.edited_reason || "" };
    })
    .sort((a, b) => a.worker.localeCompare(b.worker) || a.start.getTime() - b.start.getTime());
  // Same resolved rules as the timesheet: account overtime unless the worker overrides.
  const s = opts.settings;
  const otActive = (id: string) => { const p = readPaySettings(pay[id]); return usesAccountOvertime(p, s?.otPreset) ? Boolean(s && otRules(s)) : Boolean(p.overtime?.on); };
  const otOn = rows.some((r) => otActive(r.id));
  const lines = [["Worker", "Date", "Job", "Client", "Clock in", "Clock out", "Hours", "Edited", ...(otOn ? ["Overtime"] : [])].join(",")];
  const perWorker = new Map<string, { id: string; date: string; hours: number }[]>();
  const totals = new Map<string, number>();
  for (const r of rows) {
    lines.push([r.worker, r.date, r.job.title, r.job.client, localTime(r.start), r.end ? localTime(r.end) : "still clocked in", r.hours === null ? "" : r.hours.toFixed(2), r.edited].map(csvCell).join(","));
    totals.set(r.worker, (totals.get(r.worker) || 0) + (r.hours || 0));
    perWorker.set(r.worker, [...(perWorker.get(r.worker) || []), { id: r.id, date: r.date, hours: r.hours || 0 }]);
  }
  for (const [worker, h] of totals) {
    const list = perWorker.get(worker) || [];
    const id = list[0]?.id;
    const ot = otOn && id ? resolvedOvertime(list.map((x) => ({ date: x.date, hours: x.hours, rate: 0 })), pay[id], { settings: s, weekOff: ptoWeekOff(opts.pto || [], id) }).hours : 0;
    lines.push([worker, "", "Total", "", "", "", h.toFixed(2), "", ...(otOn ? [ot.toFixed(2)] : [])].map(csvCell).join(","));
  }
  return { csv: lines.join("\r\n") + "\r\n", count: rows.length };
}
