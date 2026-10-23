"use client";
// Owner: PTO/sick balances + pending requests (approve / deny) + add time off. Balances are published (hours only) for each worker.
import { useEffect, useMemo, useState } from "react";
import { loadPtoRequests, loadYearWorkedHours, newPtoRequest, savePtoBalances, savePtoRequest } from "@/lib/phase2-data";
import { ptoBalance, ptoOn, type PtoKind, type PtoOverride, type PtoRequest } from "@/lib/pay-phase2";
import type { TimesheetSettings } from "@/lib/timesheet";

type W = { id: string; name: string; hireDate?: string; pto?: PtoOverride };
export default function PtoOwnerCard({ workers, settings, today }: { workers: W[]; settings: TimesheetSettings; today: string }) {
  const year = today.slice(0, 4);
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [worked, setWorked] = useState<Map<string, number>>(new Map());
  const [add, setAdd] = useState({ employeeId: "", date: "", hours: "8", kind: "pto" as PtoKind });
  const [msg, setMsg] = useState("");
  useEffect(() => { void loadPtoRequests(year).then(setRequests); void loadYearWorkedHours(year).then(setWorked); }, [year]);
  const rows = useMemo(() => workers.filter((w) => ptoOn(settings, w.pto) || requests.some((r) => r.employeeId === w.id)).map((w) => ({ w, b: ptoBalance({ policy: settings, worker: w.pto, workedHours: worked.get(w.id) || 0, requests, employeeId: w.id, year, hireDate: w.hireDate, today }) })), [workers, settings, worked, requests, year, today]);
  const publishKey = rows.map((r) => `${r.w.id}:${r.b.accrued}:${r.b.taken}:${r.b.available}`).join("|");
  useEffect(() => { if (rows.length) void savePtoBalances(year, rows.map((r) => ({ employeeId: r.w.id, accrued: r.b.accrued, taken: r.b.taken, available: r.b.available }))); }, [publishKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length && !requests.length) return null;
  const pending = requests.filter((r) => r.status === "pending");
  async function decide(r: PtoRequest, status: "approved" | "denied") {
    const next = { ...r, status, decidedAt: new Date().toISOString() };
    const err = await savePtoRequest(next);
    setRequests((all) => all.map((x) => (x.id === r.id ? next : x))); setMsg(err ? `Saved here only: ${err}` : status === "approved" ? "Approved." : "Denied.");
  }
  async function addOff() {
    const hours = Number(add.hours);
    if (!add.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(add.date) || !(hours > 0 && hours <= 24)) { setMsg("Pick a worker, a day and 0–24 hours."); return; }
    const req = newPtoRequest({ employeeId: add.employeeId, date: add.date, hours, kind: add.kind, status: "approved" });
    req.decidedAt = req.createdAt;
    const err = await savePtoRequest(req); setRequests((all) => [...all, req]); setMsg(err ? `Saved here only: ${err}` : "Time off added.");
  }
  const name = (id: string) => workers.find((w) => w.id === id)?.name || "Worker";
  const input = "min-h-11 rounded-lg border bg-transparent px-2";
  return (
    <section id="pto" className="cr-panel mt-4 rounded-xl border p-3 text-sm" data-testid="pto-card">
      <h2 className="font-semibold">Time off &amp; sick ({year})</h2>
      <table className="mt-2 w-full tabular-nums" data-testid="pto-balances"><thead><tr><th className="text-left">Worker</th><th className="text-right">Earned</th><th className="text-right">Used</th><th className="text-right">Pending</th><th className="text-right">Available</th></tr></thead>
        <tbody>{rows.map(({ w, b }) => <tr key={w.id} data-testid={`pto-row-${w.id}`}><td>{w.name}{b.waitUntil ? <span className="ml-1 text-xs text-[var(--cr-muted)]">usable from {b.waitUntil}</span> : null}</td><td className="text-right">{b.accrued} h</td><td className="text-right">{b.taken} h</td><td className="text-right">{b.pending} h</td><td className="text-right font-semibold" data-testid="pto-available">{b.available} h</td></tr>)}</tbody></table>
      {pending.length > 0 && <ul className="mt-3 space-y-2" data-testid="pto-pending">{pending.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2" data-testid={`pto-req-${r.id}`}>
        <span>{name(r.employeeId)} · {r.date} · {r.hours} h {r.kind === "sick" ? "sick" : "PTO"}{r.note ? ` · “${r.note}”` : ""}</span>
        <button type="button" className="min-h-11 rounded-lg bg-teal-600 px-3 text-white" data-testid="pto-approve" onClick={() => void decide(r, "approved")}>Approve</button>
        <button type="button" className="min-h-11 rounded-lg border px-3" data-testid="pto-deny" onClick={() => void decide(r, "denied")}>Deny</button></li>)}</ul>}
      <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="pto-add">
        <select name="ptoWorker" aria-label="Worker" className={input} data-testid="pto-add-worker" value={add.employeeId} onChange={(e) => setAdd({ ...add, employeeId: e.target.value })}><option value="">Worker…</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <input type="date" name="ptoAddDate" aria-label="Day" className={input} data-testid="pto-add-date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} />
        <input name="ptoAddHours" aria-label="Hours" inputMode="decimal" className={`${input} w-20`} data-testid="pto-add-hours" value={add.hours} onChange={(e) => setAdd({ ...add, hours: e.target.value })} />
        <select name="ptoAddKind" aria-label="Type" className={input} data-testid="pto-add-kind" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as PtoKind })}><option value="pto">PTO</option><option value="sick">Sick</option></select>
        <button type="button" className="min-h-11 rounded-lg border px-3" data-testid="pto-add-save" onClick={() => void addOff()}>Add time off</button>
      </div>
      {msg && <p className="mt-1" role="status" data-testid="pto-message">{msg}</p>}
    </section>
  );
}
