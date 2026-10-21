"use client";

import { ownerOvertimeHours } from "@/lib/overtime";
import { useEffect, useMemo, useState } from "react";
import PeriodToggle from "@/components/PeriodToggle";
import { periodRange, type PeriodRange } from "@/lib/period";
import { entryHours, type ClockEntry } from "@/lib/clock";
import { readOwnerClock, refreshOwnerClock } from "@/lib/clock";
import { localYmd, timesheetCsv, weekRange } from "@/lib/timesheet-csv";

const field = "mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";

// Owner page only: download crew clock-in/out hours for a date range as CSV.
export default function TimesheetExport({ names }: { names: Record<string, string> }) {
  const [range, setRange] = useState(() => weekRange());
  const [note, setNote] = useState("");
  const [period, setPeriod] = useState<PeriodRange | "">("week");
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  useEffect(() => {
    Promise.resolve().then(() => setEntries(readOwnerClock()));
    refreshOwnerClock().then(setEntries).catch(() => {});
  }, []);
  // On-screen hours per worker for the chosen dates (hours only, no pay). "All time" = every entry.
  const onScreen = useMemo(() => {
    const totals = new Map<string, { worker: string; hours: number; count: number; open: number }>();
    for (const entry of entries) {
      const day = localYmd(new Date(entry.started_at));
      if (period !== "all" && (day < range.from || day > range.to)) continue;
      const worker = names[entry.employee_id] || entry.worker_name || entry.worker_email || "Unknown";
      const row = totals.get(worker) || { worker, hours: 0, count: 0, open: 0 };
      row.count += 1;
      if (entry.ended_at) row.hours += entryHours(entry); else row.open += 1;
      totals.set(worker, row);
    }
    return [...totals.values()].sort((a, b) => a.worker.localeCompare(b.worker));
  }, [entries, range, period, names]);
  // Overtime soft warning: clocked hours this Mon-Sun week over the Profile limit (0 = off).
  const overtime = useMemo(() => {
    const limit = ownerOvertimeHours();
    const week = periodRange("week");
    const hours = new Map<string, number>();
    for (const entry of entries) {
      const day = localYmd(new Date(entry.started_at));
      if (!entry.ended_at || day < week.from || day > week.to) continue;
      const worker = names[entry.employee_id] || entry.worker_name || entry.worker_email || "Unknown";
      hours.set(worker, (hours.get(worker) || 0) + entryHours(entry));
    }
    return { limit, rows: limit > 0 ? [...hours].filter(([, h]) => h > limit + 0.001).map(([worker, h]) => ({ worker, hours: h })) : [] };
  }, [entries, names]);
  function choose(next: PeriodRange) {
    setPeriod(next);
    if (next !== "all") setRange(periodRange(next));
  }

  async function download() {
    if (range.from > range.to) return setNote("The start date is after the end date.");
    let entries = readOwnerClock();
    try {
      entries = await refreshOwnerClock();
    } catch {
      // offline: use the cached entries
    }
    const jobs: Record<string, { title: string; client: string }> = {};
    try {
      for (const d of JSON.parse(window.localStorage.getItem("clientready-documents") || "[]")) jobs[d.id] = { title: d.title || d.data?.invoiceNumber || "", client: d.clientName || d.data?.clientName || "" };
    } catch {
      // no local documents
    }
    const pay: Record<string, unknown> = {};
    try {
      for (const person of JSON.parse(window.localStorage.getItem("clientready-employees") || "[]")) if (person?.id) pay[person.id] = person.paySettings;
    } catch {
      // no cached team
    }
    const { csv, count } = period === "all" ? timesheetCsv(entries, "0000-01-01", "9999-12-31", names, jobs, pay) : timesheetCsv(entries, range.from, range.to, names, jobs, pay);
    if (!count) return setNote("No clock entries in those dates.");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${range.from}_to_${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote(`Downloaded ${count} ${count === 1 ? "entry" : "entries"}.`);
  }

  return (
    <section className="mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 sm:p-6" data-testid="timesheet-export" aria-labelledby="timesheet-export-title">
      <h2 id="timesheet-export-title" className="text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Timesheets</h2>
      <p className="mt-1 text-xs text-[var(--cr-muted)]">Crew clock in/out hours as a spreadsheet (CSV). Hours only, no pay.</p>
      <div className="mt-3"><PeriodToggle value={period} onChange={choose} testid="timesheet-period" /></div>
      {overtime.rows.length > 0 && (
        <p role="status" data-testid="timesheet-overtime" className="cr-tone-warn mt-3 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900 dark:text-amber-200">
          Over {overtime.limit} hours this week: {overtime.rows.map((row) => `${row.worker} ${row.hours.toFixed(2)} hrs`).join("; ")}. Overtime pay rules are up to you; nothing was changed.
        </p>
      )}
      <table className="mt-3 w-full text-sm" data-testid="timesheet-screen" data-range={period || "custom"}>
        <thead><tr className="text-left text-xs text-[var(--cr-muted)]"><th className="py-1">Worker</th><th className="py-1 text-right">Entries</th><th className="py-1 text-right">Hours</th></tr></thead>
        <tbody>
          {onScreen.map((row) => (
            <tr key={row.worker} data-testid="timesheet-row" data-worker={row.worker} data-hours={row.hours.toFixed(2)} className="border-t border-slate-500/20">
              <td className="py-1.5">{row.worker}{row.open ? <span className="ml-1 text-xs text-amber-700">· {row.open} still clocked in</span> : null}</td>
              <td className="py-1.5 text-right tabular-nums">{row.count}</td>
              <td className="py-1.5 text-right tabular-nums">{row.hours.toFixed(2)}</td>
            </tr>
          ))}
          {!onScreen.length && <tr><td colSpan={3} className="py-2 text-xs text-[var(--cr-muted)]" data-testid="timesheet-empty">No clock entries in these dates.</td></tr>}
        </tbody>
      </table>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">From<input type="date" name="timesheetFrom" data-testid="timesheet-from" className={field} value={range.from} onChange={(e) => (setPeriod(""), setRange({ ...range, from: e.target.value }))} /></label>
        <label className="text-sm font-medium">To<input type="date" name="timesheetTo" data-testid="timesheet-to" className={field} value={range.to} onChange={(e) => (setPeriod(""), setRange({ ...range, to: e.target.value }))} /></label>
      </div>
      <button type="button" data-testid="timesheet-download" onClick={download} className="mt-3 rounded-lg border border-teal-500/40 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10 max-sm:min-h-11">Download CSV</button>
      {note && <p className="mt-2 text-xs text-[var(--cr-muted)]" data-testid="timesheet-note" role="status">{note}</p>}
    </section>
  );
}
