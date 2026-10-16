"use client";

import { useState } from "react";
import { readOwnerClock, refreshOwnerClock } from "@/lib/clock";
import { timesheetCsv, weekRange } from "@/lib/timesheet-csv";

const field = "mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";

// Owner page only: download crew clock-in/out hours for a date range as CSV.
export default function TimesheetExport({ names }: { names: Record<string, string> }) {
  const [range, setRange] = useState(() => weekRange());
  const [note, setNote] = useState("");

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
    const { csv, count } = timesheetCsv(entries, range.from, range.to, names, jobs);
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
      <h2 id="timesheet-export-title" className="text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Timesheet export</h2>
      <p className="mt-1 text-xs text-[var(--cr-muted)]">Crew clock in/out hours as a spreadsheet (CSV). Hours only, no pay.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">From<input type="date" name="timesheetFrom" data-testid="timesheet-from" className={field} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="text-sm font-medium">To<input type="date" name="timesheetTo" data-testid="timesheet-to" className={field} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      </div>
      <button type="button" data-testid="timesheet-download" onClick={download} className="mt-3 rounded-lg border border-teal-500/40 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10 max-sm:min-h-11">Download CSV</button>
      {note && <p className="mt-2 text-xs text-[var(--cr-muted)]" data-testid="timesheet-note" role="status">{note}</p>}
    </section>
  );
}
