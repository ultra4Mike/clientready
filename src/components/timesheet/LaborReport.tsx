"use client";
/** Reports > Labor: hours and cost by worker, job and week, from the same approved-timesheet day pay (incl. OT/DT/premium). */
import { useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/timesheet-sync";
import { laborRows, loadTimeWeek, localYmd, type LaborRow } from "@/lib/time-owner";
import { weekOf } from "@/lib/pay-types";
import { csvText, downloadCsv } from "@/lib/csv";
import { loadPtoRequests } from "@/lib/phase2-data";
import { ptoDays } from "@/lib/pay-phase2";

type By = "worker" | "job" | "week";
export default function LaborReport({ docs }: { docs: { id: string; title?: string; clientName?: string; data?: Record<string, unknown> }[] }) {
  const [weeks, setWeeks] = useState(4);
  const [by, setBy] = useState<By>("worker");
  const [rows, setRows] = useState<LaborRow[] | null>(null);
  useEffect(() => {
    let live = true;
    const start = weekOf(localYmd());
    void Promise.all(Array.from({ length: weeks }, (_, i) => loadTimeWeek(addDays(start, -7 * i)))).then(async (list) => {
      const out = list.flatMap(laborRows);
      // Approved PTO / sick: paid hours with no job (never changes recorded pay).
      const from = addDays(start, -7 * (weeks - 1)), to = addDays(start, 6), workers = list[0]?.workers || [];
      const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
      const reqs = (await Promise.all(years.map((y) => loadPtoRequests(y).catch(() => [])))).flat();
      for (const [k, v] of ptoDays(reqs, workers as never, from, to)) {
        const [employeeId, date] = k.split("|");
        out.push({ employeeId, name: workers.find((x) => x.id === employeeId)?.name || "Worker", date, week: weekOf(date), docId: "pto", minutes: 0, cents: v.cents, otHours: 0, dtHours: 0, premiumCents: 0, approved: true, ptoHours: v.hours });
      }
      if (live) setRows(out);
    }).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [weeks]);
  const jobName = (id: string) => { const d = docs.find((x) => x.id === id); return id === "pto" ? "PTO / sick" : id ? `${d?.data?.invoiceNumber || ""} ${d?.clientName || d?.title || ""}`.trim() || id.slice(0, 8) : "Salary (no job)"; };
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; minutes: number; cents: number; ot: number; dt: number; premium: number; estimated: boolean; topUp: number; pto: number }>();
    for (const r of rows || []) {
      const key = by === "worker" ? r.employeeId : by === "job" ? r.docId : r.week;
      const label = by === "worker" ? r.name : by === "job" ? jobName(r.docId) : `Week of ${r.week}`;
      const g = m.get(key) || { label, minutes: 0, cents: 0, ot: 0, dt: 0, premium: 0, estimated: false, topUp: 0, pto: 0 };
      g.minutes += r.minutes; g.cents += r.cents; g.ot += r.otHours; g.dt += r.dtHours; g.premium += r.premiumCents; g.estimated ||= !r.approved; g.topUp += r.topUpCents || 0; g.pto += r.ptoHours || 0;
      m.set(key, g);
    }
    return [...m.entries()].sort((a, b) => b[1].cents - a[1].cents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, by]);
  const total = groups.reduce((s, [, g]) => ({ minutes: s.minutes + g.minutes, cents: s.cents + g.cents }), { minutes: 0, cents: 0 });
  return (
    <section className="cr-section mb-6 rounded-2xl border p-4" data-testid="labor-report">
      <h2 className="text-base font-semibold">Labor hours &amp; cost</h2>
      <p className="text-xs text-[var(--cr-muted)]">From the timesheet: approved days are final, others are estimates. Includes overtime, double time, break premium, minimum-wage top-up and approved PTO / sick.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Group by" className="flex gap-1">{(["worker", "job", "week"] as By[]).map((b) => (
          <button key={b} type="button" className="cr-btn cr-btn-secondary" data-testid={`labor-by-${b}`} data-state={by === b ? "on" : "off"} aria-pressed={by === b} onClick={() => setBy(b)}>By {b}</button>))}</div>
        <label className="text-sm">Weeks <select name="labor-weeks" data-testid="labor-weeks" className="min-h-11 rounded-lg border bg-transparent px-2" value={weeks} onChange={(e) => { setRows(null); setWeeks(Number(e.target.value)); }}>{[1, 2, 4, 8, 13].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <button type="button" className="cr-btn cr-btn-secondary" data-testid="labor-export" disabled={!groups.length} onClick={() => downloadCsv(`labor-by-${by}.csv`, csvText(["Name", "Hours", "OT hours", "DT hours", "Break premium", "Min-wage top-up", "PTO hours", "Cost", "Status"], groups.map(([, g]) => [g.label, (g.minutes / 60).toFixed(2), g.ot.toFixed(2), g.dt.toFixed(2), (g.premium / 100).toFixed(2), (g.topUp / 100).toFixed(2), g.pto.toFixed(2), (g.cents / 100).toFixed(2), g.estimated ? "estimated" : "approved"])))}>Export (CSV)</button>
      </div>
      {rows === null ? <p className="mt-2 text-[var(--cr-muted)]" data-testid="labor-loading">Loading…</p> : !groups.length ? <p className="mt-2 text-[var(--cr-muted)]" data-testid="labor-empty">No crew hours in this range yet.</p> : (
        <table className="mt-2 w-full text-sm" data-testid="labor-table">
          <thead><tr><th className="text-left">Name</th><th className="text-right">Hours</th><th className="text-right">OT / DT</th><th className="text-right">Top-up / PTO h</th><th className="text-right">Cost</th></tr></thead>
          <tbody>{groups.map(([k, g]) => (
            <tr key={k} className="border-t" data-testid="labor-row" data-key={k} data-state={g.estimated ? "estimated" : "approved"}>
              <td>{g.label}</td><td className="text-right tabular-nums">{(g.minutes / 60).toFixed(2)}</td><td className="text-right tabular-nums">{g.ot.toFixed(2)} / {g.dt.toFixed(2)}</td><td className="text-right tabular-nums" data-testid="labor-topup-pto">${(g.topUp / 100).toFixed(2)} / {g.pto.toFixed(2)}</td>
              <td className="text-right tabular-nums" data-testid="labor-cost">${(g.cents / 100).toFixed(2)}{g.estimated ? " est." : ""}</td></tr>))}
            <tr className="border-t font-semibold" data-testid="labor-total"><td>Total</td><td className="text-right tabular-nums">{(total.minutes / 60).toFixed(2)}</td><td /><td /><td className="text-right tabular-nums">${(total.cents / 100).toFixed(2)}</td></tr>
          </tbody>
        </table>)}
    </section>
  );
}
