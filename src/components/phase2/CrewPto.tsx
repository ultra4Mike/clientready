"use client";
// Crew: own PTO/sick balance (hours only) and requests. Never shows pay.
import { useEffect, useState } from "react";
import { loadMyPto, requestMyPto } from "@/lib/phase2-data";
import { ptoRequestProblem, type PtoKind, type PtoRequest } from "@/lib/pay-phase2";
import { ymdTz } from "@/lib/timesheet";

export default function CrewPto() {
  const year = ymdTz(new Date()).slice(0, 4);
  const [requests, setRequests] = useState<PtoRequest[]>([]);
  const [balance, setBalance] = useState<{ accrued: number; taken: number; available: number } | null>(null);
  const [date, setDate] = useState(""); const [hours, setHours] = useState("8"); const [kind, setKind] = useState<PtoKind>("pto"); const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const reload = () => loadMyPto(year).then((r) => { setRequests(r.requests); setBalance(r.balance); });
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit() {
    const h = Number(hours);
    const problem = ptoRequestProblem({ hours: h, date }, balance ? balance.available : 24);
    if (problem) { setMsg(problem); return; }
    const err = await requestMyPto({ date, hours: h, kind, note });
    setMsg(err ? `Not sent: ${err}` : "Sent to your boss for approval.");
    if (!err) { setDate(""); setNote(""); void reload(); }
  }
  const input = "mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-3";
  return (
    <section className="cr-panel mt-4 rounded-xl border p-3 text-sm" data-testid="crew-pto">
      <h3 className="font-semibold">Time off &amp; sick</h3>
      <p className="mt-1 tabular-nums" data-testid="crew-pto-balance" data-available={balance?.available ?? ""}>{balance ? <>Available: <b>{balance.available} h</b> · earned {balance.accrued} h · used {balance.taken} h</> : "Your boss hasn't set up paid time off yet."}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label>Day<input type="date" name="ptoDate" data-testid="crew-pto-date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Hours<input name="ptoHours" inputMode="decimal" data-testid="crew-pto-hours" className={input} value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        <label>Type<select name="ptoKind" data-testid="crew-pto-kind" className={input} value={kind} onChange={(e) => setKind(e.target.value as PtoKind)}><option value="pto">Paid time off</option><option value="sick">Sick</option></select></label>
        <label>Note<input name="ptoNote" data-testid="crew-pto-note" className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button type="button" data-testid="crew-pto-submit" className="mt-2 min-h-11 rounded-lg border px-3" onClick={() => void submit()}>Ask for time off</button>
      {msg && <p className="mt-1" role="status" data-testid="crew-pto-message">{msg}</p>}
      {requests.length > 0 && <ul className="mt-2 space-y-1" data-testid="crew-pto-list">{requests.map((r) => <li key={r.id} data-testid="crew-pto-item" data-status={r.status}>{r.date} · {r.hours} h {r.kind === "sick" ? "sick" : "PTO"} · <span className="cr-chip2">{r.status}</span></li>)}</ul>}
    </section>
  );
}
