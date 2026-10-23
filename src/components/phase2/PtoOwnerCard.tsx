"use client";
// Owner: PTO/sick balances + pending requests (approve / deny) + add time off. Balances are published (hours only) for each worker.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { loadPtoRequests, loadYearWorkedHours, newPtoRequest, savePtoBalances, savePtoRequest } from "@/lib/phase2-data";
import { ptoBalance, ptoKindLabel, ptoOn, type PtoKind, type PtoOverride, type PtoRequest } from "@/lib/pay-phase2";
import type { TimesheetSettings } from "@/lib/timesheet";

type W = { id: string; name: string; hireDate?: string; pto?: PtoOverride };
/** `onAdded` lets the timesheet reload the week after an owner adds time off; `only` scopes the card to one worker (employee page). */
export default function PtoOwnerCard({ workers, settings, today, onAdded, only }: { workers: W[]; settings: TimesheetSettings; today: string; onAdded?: (r: PtoRequest) => void; only?: string }) {
  const year = today.slice(0, 4);
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [worked, setWorked] = useState<Map<string, number>>(new Map());
  const [msg, setMsg] = useState(""); const [over, setOver] = useState("");
  useEffect(() => { void loadPtoRequests(year).then(setRequests); void loadYearWorkedHours(year).then(setWorked); }, [year]);
  const rows = useMemo(() => workers.filter((w) => ptoOn(settings, w.pto) || requests.some((r) => r.employeeId === w.id)).map((w) => ({ w, b: ptoBalance({ policy: settings, worker: w.pto, workedHours: worked.get(w.id) || 0, requests, employeeId: w.id, year, hireDate: w.hireDate, today }) })), [workers, settings, worked, requests, year, today]);
  const publishKey = rows.map((r) => `${r.w.id}:${r.b.accrued}:${r.b.taken}:${r.b.available}`).join("|");
  useEffect(() => { if (rows.length && !only) void savePtoBalances(year, rows.map((r) => ({ employeeId: r.w.id, accrued: r.b.accrued, taken: r.b.taken, available: r.b.available }))); }, [publishKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Retest bug 2: the Add time off form (PTO / Sick / Holiday) always shows, even before anyone has a balance,
  // so an owner can record a paid holiday with PTO off.
  const mine = (r: PtoRequest) => !only || r.employeeId === only;
  const shown = only ? rows.filter((r) => r.w.id === only) : rows;
  const pending = requests.filter((r) => r.status === "pending" && mine(r));
  const decided = requests.filter((r) => r.status !== "pending" && mine(r)).sort((a, b) => b.date.localeCompare(a.date));
  async function decide(r: PtoRequest, status: "approved" | "denied") {
    const next = { ...r, status, decidedAt: new Date().toISOString() };
    const err = await savePtoRequest(next);
    setRequests((all) => all.map((x) => (x.id === r.id ? next : x))); setMsg(err ? `Saved here only: ${err}` : status === "approved" ? "Approved." : "Denied.");
  }
  async function addOff(add: AddInput) {
    const hours = Number(add.hours);
    if (!add.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(add.date) || !(hours > 0 && hours <= 24)) { setMsg("Pick a worker, a day and 0–24 hours."); return false; }
    const bal = rows.find((r) => r.w.id === add.employeeId)?.b;
    const left = bal ? bal.available : 0;
    const key = `${add.employeeId}|${add.date}|${hours}`;
    if (add.kind !== "holiday" && hours > left + 1e-9 && over !== key) { setOver(key); setMsg(`Only ${left} h available for ${name(add.employeeId)}. Press “Add anyway” to go over.`); return false; }
    setOver("");
    const req = newPtoRequest({ employeeId: add.employeeId, date: add.date, hours, kind: add.kind, status: "approved" });
    req.decidedAt = req.createdAt; req.note = add.note.trim().slice(0, 300);
    const err = await savePtoRequest(req); setRequests((all) => [...all, req]); setMsg(err ? `Saved here only: ${err}` : add.kind === "holiday" ? "Holiday hours added." : "Time off added.");
    onAdded?.(req);
    return true;
  }
  const name = (id: string) => workers.find((w) => w.id === id)?.name || "Worker";
  const input = "min-h-11 rounded-lg border bg-transparent px-2";
  return (
    <section id={only ? `pto-${only}` : "pto"} className="cr-panel mt-4 rounded-xl border p-3 text-sm" data-testid={only ? "emp-pto-card" : "pto-card"}>
      <h2 className="font-semibold">{only ? "Add time off" : `Time off & sick (${year})`}</h2>
      {shown.length > 0 && <table className="mt-2 w-full tabular-nums" data-testid="pto-balances"><thead><tr><th className="text-left">Worker</th><th className="text-right">Earned</th><th className="text-right">Used</th><th className="text-right">Pending</th><th className="text-right">Available</th></tr></thead>
        <tbody>{shown.map(({ w, b }) => <tr key={w.id} data-testid={`pto-row-${w.id}`}><td>{w.name}{b.waitUntil ? <span className="ml-1 text-xs text-[var(--cr-muted)]">usable from {b.waitUntil}</span> : null}</td><td className="text-right">{b.accrued} h</td><td className="text-right">{b.taken} h</td><td className="text-right">{b.pending} h</td><td className="text-right font-semibold" data-testid="pto-available">{b.available} h</td></tr>)}</tbody></table>}
      {pending.length > 0 && <ul className="mt-3 space-y-2" data-testid="pto-pending">{pending.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2" data-testid={`pto-req-${r.id}`}>
        <span>{name(r.employeeId)} · {r.date} · {r.hours} h {ptoKindLabel(r.kind, true)}{r.note ? ` · “${r.note}”` : ""}</span>
        <button type="button" className="min-h-11 rounded-lg bg-teal-600 px-3 text-white" data-testid="pto-approve" onClick={() => void decide(r, "approved")}>Approve</button>
        <button type="button" className="min-h-11 rounded-lg border px-3" data-testid="pto-deny" onClick={() => void decide(r, "denied")}>Deny</button></li>)}</ul>}
      {decided.length > 0 && <details className="mt-3" data-testid="pto-decided"><summary className="cursor-pointer">Approved and denied ({decided.length})</summary><ul className="mt-1 space-y-1">{decided.map((r) => <li key={r.id} data-testid={`pto-decided-${r.id}`} data-status={r.status}>{name(r.employeeId)} · {r.date} · {r.hours} h {ptoKindLabel(r.kind, true)} · <span className="cr-chip2">{r.status}</span>{r.note ? <span className="block text-xs text-[var(--cr-muted)]" data-testid="pto-decided-note">“{r.note}”</span> : null}</li>)}</ul></details>}
      <PtoAddForm workers={only ? workers.filter((w) => w.id === only) : workers} fixed={only} dayHours={settings.ptoDayHours || 8} over={over} onAdd={addOff} />
      {msg && <p className="mt-1" role="status" data-testid="pto-message">{msg}</p>}
    </section>
  );
}

type AddInput = { employeeId: string; date: string; hours: string; kind: PtoKind; note: string };
/** Add-time-off form. Hours + note are uncontrolled and the form is memoized, so typing never re-renders the balances table. */
const PtoAddForm = memo(function PtoAddForm({ workers, fixed, dayHours, over, onAdd }: { workers: W[]; fixed?: string; dayHours: number; over: string; onAdd: (a: AddInput) => Promise<boolean> }) {
  const [employeeId, setEmployeeId] = useState(fixed || ""); const [date, setDate] = useState(""); const [kind, setKind] = useState<PtoKind>("pto");
  const hoursRef = useRef<HTMLInputElement>(null); const noteRef = useRef<HTMLInputElement>(null);
  const [hoursNow, setHoursNow] = useState(String(dayHours));
  const input = "min-h-11 rounded-lg border bg-transparent px-2";
  async function save() {
    const ok = await onAdd({ employeeId, date, kind, hours: hoursRef.current?.value || "", note: noteRef.current?.value || "" });
    if (ok && noteRef.current) noteRef.current.value = "";
  }
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2" data-testid="pto-add">
      {!fixed && <select name="ptoWorker" aria-label="Worker" className={input} data-testid="pto-add-worker" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Worker…</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
      <input type="date" name="ptoAddDate" aria-label="Day" className={input} data-testid="pto-add-date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input ref={hoursRef} name="ptoAddHours" aria-label="Hours" inputMode="decimal" autoComplete="off" className={`${input} w-20`} data-testid="pto-add-hours" defaultValue={String(dayHours)} onBlur={(e) => setHoursNow(e.target.value)} />
      <select name="ptoAddKind" aria-label="Type" className={input} data-testid="pto-add-kind" value={kind} onChange={(e) => setKind(e.target.value as PtoKind)}><option value="pto">PTO</option><option value="sick">Sick</option><option value="holiday">Holiday (paid, not from PTO)</option></select>
      <input ref={noteRef} name="ptoAddNote" aria-label="Note" placeholder="Note (optional)" autoComplete="off" maxLength={300} className={`${input} min-w-0 flex-1`} data-testid="pto-add-note" defaultValue="" />
      <button type="button" className="min-h-11 rounded-lg border px-3" data-testid="pto-add-save" onClick={() => void save()}>{over && over === `${employeeId}|${date}|${Number(hoursNow)}` ? "Add anyway" : "Add time off"}</button>
    </div>
  );
});
