"use client";
// Crew lead: his crew's status today + clock them in/out (server records acted_by = the lead). No pay, no prices.
import { useEffect, useState } from "react";
import { leadTap, loadLeadSelf, loadLeadTeam, type LeadSelf } from "@/lib/phase2-data";
import { dayState, fmtTime, ymdTz, type TapEvent } from "@/lib/timesheet";

const WORD = { OFF_DUTY: "Off", ON_DUTY_IDLE: "On duty", WORKING: "Working", IN_TRANSIT: "Driving", ON_BREAK: "On break" } as const;
export default function LeadPanel() {
  const [self, setSelf] = useState<LeadSelf | null>(null);
  const [people, setPeople] = useState<{ employee_id: string; name: string }[]>([]);
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");
  const today = ymdTz(new Date());
  const reload = () => loadLeadTeam(today).then((t) => { setPeople(t.people); setEvents(t.events.map((e) => ({ id: e.id, employeeId: e.employee_id, date: today, kind: e.kind, at: e.at }) as TapEvent)); });
  useEffect(() => { void loadLeadSelf().then((s) => { setSelf(s); if (s) void reload(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!self) return null;
  async function tap(id: string, kind: Parameters<typeof leadTap>[1]) {
    setBusy(id); const err = await leadTap(id, kind); setBusy("");
    setMsg(err ? `Not saved: ${err}` : "Saved."); if (!err) void reload();
  }
  const btn = "min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50";
  return (
    <section className="cr-panel mt-4 rounded-xl border p-3 text-sm" data-testid="crew-lead">
      <h3 className="font-semibold">My crew today</h3>
      {!people.length && <p className="text-[var(--cr-muted)]" data-testid="crew-lead-empty">No crew assigned to you yet.</p>}
      <ul className="mt-2 space-y-2">{people.map((p) => {
        const mine = events.filter((e) => e.employeeId === p.employee_id).sort((a, b) => a.at.localeCompare(b.at));
        const st = dayState(mine);
        return (
          <li key={p.employee_id} className="flex flex-wrap items-center gap-2" data-testid={`crew-lead-row-${p.employee_id}`} data-state={st.state}>
            <span className="min-w-28 font-medium">{p.name}</span>
            <span className="cr-chip2" data-testid="crew-lead-state">{WORD[st.state]}{self.seeHours && st.since ? ` since ${fmtTime(st.since)}` : ""}</span>
            {self.clockTeam && (st.state === "OFF_DUTY"
              ? <button type="button" className={btn} disabled={busy === p.employee_id} data-testid="crew-lead-in" onClick={() => void tap(p.employee_id, "start_day")}>Clock in</button>
              : <>
                {st.state === "ON_BREAK" ? <button type="button" className={btn} data-testid="crew-lead-break-end" onClick={() => void tap(p.employee_id, "break_end")}>End break</button>
                  : <button type="button" className={btn} data-testid="crew-lead-break" onClick={() => void tap(p.employee_id, "break_start")}>Break</button>}
                <button type="button" className={btn} disabled={busy === p.employee_id} data-testid="crew-lead-out" onClick={() => void tap(p.employee_id, "end_day")}>Clock out</button>
              </>)}
          </li>);
      })}</ul>
      {msg && <p className="mt-1" role="status" data-testid="crew-lead-message">{msg}</p>}
    </section>
  );
}
