"use client";
// Crew: own PTO/sick balance (hours only) and requests. Never shows pay.
import { memo, useEffect, useRef, useState } from "react";
import { loadMyPto, requestMyPto } from "@/lib/phase2-data";
import { ptoKindLabel, ptoRequestProblem, type PtoKind, type PtoRequest } from "@/lib/pay-phase2";
import { ymdTz, type TimesheetSettings } from "@/lib/timesheet";
import { loadMyTimeRules } from "@/lib/day-events";

function CrewPto() {
  const year = ymdTz(new Date()).slice(0, 4);
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [balance, setBalance] = useState<{ accrued: number; taken: number; available: number } | null>(null);
  const [date, setDate] = useState(""); const [kind, setKind] = useState<PtoKind>("pto");
  // Hours + note are uncontrolled so typing never lags or gets rewritten by a parent re-render.
  const hoursRef = useRef<HTMLInputElement>(null); const noteRef = useRef<HTMLInputElement>(null);
  const [rules, setRules] = useState<TimesheetSettings | null>(null); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const reload = () => loadMyPto(year).then((r) => { setRequests(r.requests); setBalance(r.balance); });
  useEffect(() => { void reload(); void loadMyTimeRules().then(setRules); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    if (busy) return;
    const h = Number(hoursRef.current?.value || ""); const note = (noteRef.current?.value || "").trim().slice(0, 300);
    const pendingH = requests.filter((r) => r.status === "pending").reduce((s, r) => s + r.hours, 0);
    const left = allowNeg ? 24 : Math.max(0, (balance?.available || 0) - pendingH);
    const problem = ptoRequestProblem({ hours: h, date }, left);
    if (problem) { setMsg(problem); return; }
    setBusy(true);
    const err = await requestMyPto({ date, hours: h, kind, note });
    setBusy(false);
    setMsg(err ? `Not sent: ${err}` : "Sent to your boss for approval.");
    if (!err) { setDate(""); if (noteRef.current) noteRef.current.value = ""; void reload(); }
  }
  const ptoOff = rules ? rules.ptoPreset === "off" || rules.ptoPreset === "federal" || rules.ptoRequestsOn === false : false;
  const allowNeg = Boolean(rules?.ptoAllowNegative);
  const on = Boolean(balance) && !ptoOff;
  const input = "mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-3";
  return (
    <section className="cr-panel mt-4 rounded-xl border p-3 text-sm" data-testid="crew-pto">
      <h3 className="font-semibold">Time off &amp; sick</h3>
      <p className="mt-1 tabular-nums" data-testid="crew-pto-balance" data-available={balance?.available ?? ""}>{balance ? <>Available: <b>{balance.available} h</b> · earned {balance.accrued} h · used {balance.taken} h</> : "Your boss hasn't set up paid time off yet."}</p>
      {on ? <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label>Day<input type="date" name="ptoDate" data-testid="crew-pto-date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Hours<input ref={hoursRef} name="ptoHours" inputMode="decimal" autoComplete="off" data-testid="crew-pto-hours" className={input} defaultValue={String(rules?.ptoDayHours || 8)} key={`h${rules?.ptoDayHours || 8}`} /></label>
        <label>Type<select name="ptoKind" data-testid="crew-pto-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as PtoKind)}><option value="pto">Paid time off</option><option value="sick">Sick</option></select></label>
        <label>Note<input ref={noteRef} name="ptoNote" autoComplete="off" maxLength={300} data-testid="crew-pto-note" className={input} defaultValue="" /></label>
      </div>
      <button type="button" data-testid="crew-pto-submit" className="mt-2 min-h-11 rounded-lg border px-3 disabled:opacity-50" disabled={busy} onClick={() => void submit()}>{busy ? "Sending…" : "Ask for time off"}</button>
      </> : ptoOff && <p className="mt-1 text-[var(--cr-muted)]" data-testid="crew-pto-off">Time-off requests are off for your account.</p>}
      {msg && <p className="mt-1" role="status" data-testid="crew-pto-message">{msg}</p>}
      {requests.length > 0 && <ul className="mt-2 space-y-1" data-testid="crew-pto-list">{requests.map((r) => <li key={r.id} data-testid="crew-pto-item" data-status={r.status}>{r.date} · {r.hours} h {ptoKindLabel(r.kind, true)} · <span className="cr-chip2">{r.status}</span>{r.note ? <span className="block text-xs text-[var(--cr-muted)]" data-testid="crew-pto-item-note">“{r.note}”</span> : null}</li>)}</ul>}
    </section>
  );
}

export default memo(CrewPto);
