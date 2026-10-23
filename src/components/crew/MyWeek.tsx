"use client";
/**
 * Crew portal "My week": hours per day (paid, breaks, unpaid) from My day taps, plus hours from the old per-job
 * Clock in/out (still readable), and the weekly "I confirm these hours are correct" sign-off. Hours only, never pay.
 */
import { useEffect, useMemo, useState } from "react";
import { attestWeek, loadMyTaps, loadMyTimeOverrides, loadMyTimeRules, localDate, readMyAttestations } from "@/lib/day-events";
import { buildDay, DEFAULT_TIMESHEET_SETTINGS, crewFlagReasons, hm, type TapEvent, type TimesheetSettings, type WorkerTimeOverrides } from "@/lib/timesheet";
import { entryHours, type ClockEntry } from "@/lib/clock";

export const weekStartOf = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return localDate(x); };
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };
const dayName = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export type WeekRow = { date: string; paid: number; breaks: number; paidBreaks: number; unpaid: number; oldClock: number; flagged: boolean; reasons: string[] };

export function weekRows(events: TapEvent[], clock: ClockEntry[], week: string, rules: TimesheetSettings, now: string, employeeId = "me", worker: WorkerTimeOverrides = {}): WeekRow[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((date) => {
    const evs = events.filter((e) => e.date === date).map((e) => ({ ...e, employeeId }));
    const sheet = evs.length ? buildDay({ employeeId, date, events: evs, schedule: [], now, settings: rules, worker }) : null;
    const oldClock = clock.filter((c) => localDate(new Date(c.started_at)) === date).reduce((s, c) => s + entryHours(c, Date.parse(now)) * 60, 0);
    const paidBreaks = sheet ? sheet.breaks.filter((b) => b.paid).reduce((s, b) => s + b.minutes, 0) : 0;
    const reasons = sheet ? crewFlagReasons(sheet, [], rules).map((r) => r.text) : [];
    return { date, paid: sheet?.paidMinutes || 0, breaks: (sheet?.breakMinutes || 0) + paidBreaks, paidBreaks, unpaid: (sheet?.breakMinutes || 0) + (sheet?.unpaidGapMinutes || 0), oldClock, flagged: reasons.length > 0, reasons };
  });
}

export default function MyWeek({ email, employeeId, clock }: { email: string; employeeId: string; clock: ClockEntry[] }) {
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [rules, setRules] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [attested, setAttested] = useState<Record<string, string>>({});
  const [worker, setWorker] = useState<WorkerTimeOverrides>({});
  const [note, setNote] = useState("");
  const [now] = useState(() => new Date().toISOString());
  const week = weekStartOf(new Date(now));
  useEffect(() => {
    if (!email) return;
    void loadMyTaps(email).then(setEvents); void loadMyTimeRules().then(setRules); void loadMyTimeOverrides().then(setWorker); void Promise.resolve().then(() => setAttested(readMyAttestations(email)));
  }, [email]);
  const rows = useMemo(() => weekRows(events, clock, week, rules, now, employeeId || "me", worker), [events, clock, week, rules, now, employeeId, worker]);
  const total = rows.reduce((s, r) => s + r.paid + r.oldClock, 0);
  const breaks = rows.reduce((s, r) => s + r.breaks, 0);
  const today = localDate(new Date(now));

  async function attest() {
    const error = await attestWeek(week, Math.round(total), email);
    void Promise.resolve().then(() => setAttested(readMyAttestations(email)));
    setNote(error ? `Saved on this phone, will send when online: ${error}` : "Thanks. Your hours for this week are confirmed.");
  }

  return (
    <section data-testid="my-week" className="cr-section space-y-3">
      <h2 className="text-lg font-bold tracking-tight">My week</h2>
      <p className="text-xs text-[var(--cr-muted)]">Paid hours from My day. Short breaks are paid; long breaks and gaps are not. Older per-job clock times are shown too.</p>
      <table className="w-full text-sm tabular-nums">
        <thead><tr className="text-left text-xs uppercase text-[var(--cr-muted)]"><th className="py-1">Day</th><th className="py-1 text-right">Paid</th><th className="py-1 text-right">Breaks</th><th className="py-1 text-right">Unpaid</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} data-testid={`my-week-day-${r.date}`} data-state={r.flagged ? "flagged" : r.paid + r.oldClock > 0 ? "worked" : "empty"} data-today={r.date === today ? "true" : "false"} className="border-t">
              <td className="py-1.5">{dayName(r.date)}{r.flagged && <span data-testid="my-week-flag" title={r.reasons.join(" ")} className="cr-chip2 cr-tone-warn ml-1">!</span>}
                {r.flagged && <span className="block text-xs cr-text-warn" data-testid="my-week-reason">{r.reasons[0]}</span>}</td>
              <td className="py-1.5 text-right" data-testid="my-week-paid">{r.paid + r.oldClock > 0 ? hm(r.paid + r.oldClock) : "–"}</td>
              <td className="py-1.5 text-right" data-testid="my-week-breaks">{r.breaks > 0 ? hm(r.breaks) : "–"}</td>
              <td className="py-1.5 text-right" data-testid="my-week-unpaid">{r.unpaid > 0 ? hm(r.unpaid) : "–"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t font-semibold" data-testid="my-week-total"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{hm(total)}</td><td className="py-1.5 text-right">{hm(breaks)}</td><td /></tr></tfoot>
      </table>
      <div data-testid="attest" data-state={attested[week] ? "done" : "open"} className="text-sm">
        {attested[week] ? <p data-testid="attest-done">Week confirmed {new Date(attested[week]).toLocaleString()}.</p>
          : <button data-testid="attest-week" className="cr-btn cr-btn-primary min-h-11 w-full" onClick={attest}>I confirm these hours are correct</button>}
      </div>
      {note && <p data-testid="my-week-note" role="status" className="text-sm">{note}</p>}
    </section>
  );
}
