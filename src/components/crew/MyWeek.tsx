"use client";
/**
 * Crew portal "My week": hours per day (paid, breaks, unpaid) from My day taps, plus hours from the old per-job
 * Clock in/out (still readable), and the weekly "I confirm these hours are correct" sign-off. Hours only, never pay.
 */
import { useEffect, useMemo, useState } from "react";
import { attestWeek, loadBusinessTz, loadMyDayStatus, loadMyFixes, loadMyTaps, loadMyTimeOverrides, loadMyTimeRules, localDate, readMyAttestations } from "@/lib/day-events";
import { applyFixes, buildDay, fmtTime, type FixRequest, DEFAULT_TIMESHEET_SETTINGS, crewFlagReasons, hm, type TapEvent, type TimesheetSettings, type WorkerTimeOverrides } from "@/lib/timesheet";
import { entryHours, type ClockEntry } from "@/lib/clock";

export const weekStartOf = (d: Date) => { const ymd = localDate(d); const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tapWord: Record<string, string> = { start_day: "Start day", start_job: "Start job", arrive: "Arrived", start_transit: "Drive", break_start: "Break", break_end: "End break", end_day: "End day", end_shift: "End day" };
const dayName = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export type WeekRow = { date: string; approved?: boolean; paid: number; breaks: number; paidBreaks: number; unpaid: number; oldClock: number; flagged: boolean; reasons: string[] };

/** One number per day: the owner's approved/edited minutes when there are any, else this phone's estimate from the taps (with approved fixes). */
export function weekRows(events: TapEvent[], clock: ClockEntry[], week: string, rules: TimesheetSettings, now: string, employeeId = "me", worker: WorkerTimeOverrides = {}, fixes: FixRequest[] = [], status: { date: string; minutes: number | null; approved: boolean }[] = []): WeekRow[] {
  events = applyFixes(events, fixes);
  return Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((date) => {
    const evs = events.filter((e) => e.date === date).map((e) => ({ ...e, employeeId }));
    const sheet = evs.length ? buildDay({ employeeId, date, events: evs, schedule: [], now, settings: rules, worker }) : null;
    const oldClock = clock.filter((c) => localDate(new Date(c.started_at)) === date).reduce((s, c) => s + entryHours(c, Date.parse(now)) * 60, 0);
    const paidBreaks = sheet ? sheet.breaks.filter((b) => b.paid).reduce((s, b) => s + b.minutes, 0) : 0;
    const reasons = sheet ? crewFlagReasons(sheet, [], rules).map((r) => r.text) : [];
    const st = status.find((x) => x.date === date);
    return { date, approved: Boolean(st?.approved), paid: st?.minutes != null ? st.minutes : sheet?.paidMinutes || 0, breaks: (sheet?.breakMinutes || 0) + paidBreaks, paidBreaks, unpaid: (sheet?.breakMinutes || 0) + (sheet?.unpaidGapMinutes || 0), oldClock, flagged: reasons.length > 0, reasons };
  });
}

export default function MyWeek({ email, employeeId, clock, onRows }: { email: string; employeeId: string; clock: ClockEntry[]; onRows?: (rows: WeekRow[]) => void }) {
  const [openDay, setOpenDay] = useState("");
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [rules, setRules] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [attested, setAttested] = useState<Record<string, string>>({});
  const [worker, setWorker] = useState<WorkerTimeOverrides>({});
  const [note, setNote] = useState("");
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [status, setStatus] = useState<{ date: string; minutes: number | null; approved: boolean }[]>([]);
  const [now] = useState(() => new Date().toISOString());
  const week = weekStartOf(new Date(now));
  useEffect(() => {
    if (!email) return;
    void loadBusinessTz(true).then(() => loadMyTaps(email)).then(setEvents); void loadMyFixes(email).then(setFixes); void loadMyTimeRules().then(setRules); void loadMyTimeOverrides().then(setWorker); void Promise.resolve().then(() => setAttested(readMyAttestations(email)));
  }, [email]);
  useEffect(() => { if (email) void loadMyDayStatus(week, addDays(week, 6)).then(setStatus); }, [email, week]);
  const rows = useMemo(() => weekRows(events, clock, week, rules, now, employeeId || "me", worker, fixes, status), [events, clock, week, rules, now, employeeId, worker, fixes, status]);
  useEffect(() => { onRows?.(rows); }, [rows, onRows]);
  const fixedTaps = useMemo(() => applyFixes(events, fixes), [events, fixes]);
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
      {/* CSS grid (not a table) so the body rows are always as wide as the header and Total at any phone width. */}
      <div className="w-full text-sm tabular-nums" role="table" data-testid="my-week-table">
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_4.75rem] text-left text-xs uppercase text-[var(--cr-muted)]"><span role="columnheader" className="py-1">Day</span><span role="columnheader" className="py-1 pr-1 text-right" data-testid="my-week-h-paid">Paid</span><span role="columnheader" className="py-1 pr-1 text-right" data-testid="my-week-h-breaks">Breaks</span><span role="columnheader" className="py-1 pr-1 text-right" data-testid="my-week-h-unpaid">Unpaid</span></div>
        {rows.map((r) => {
          const taps = fixedTaps.filter((e) => e.date === r.date).sort((x, y) => x.at.localeCompare(y.at));
          const open = openDay === r.date;
          return (
            <div key={r.date} role="rowgroup" className="border-t">
              <button type="button" role="row" aria-expanded={open} disabled={!taps.length && !r.paid} onClick={() => setOpenDay(open ? "" : r.date)} data-testid={`my-week-day-${r.date}`} data-state={r.flagged ? "flagged" : r.paid + r.oldClock > 0 ? "worked" : "empty"} data-today={r.date === today ? "true" : "false"} className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_4.75rem] items-start bg-transparent text-left">
                <span role="cell" className="py-1.5"><span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">{dayName(r.date)}{r.approved && <span data-testid="my-week-approved" className="cr-chip2 cr-tone-good px-1 text-xs">✓</span>}{r.flagged && <span data-testid="my-week-flag" title={r.reasons.join(" ")} className="cr-chip2 cr-tone-warn px-1 text-xs">!</span>}{taps.some((e) => e.wasAt && e.wasAt !== e.at) && <span data-testid="my-week-fixed" className="text-xs text-[var(--cr-muted)]">fixed</span>}</span>
                  {r.flagged && <span className="block text-xs cr-text-warn" data-testid="my-week-reason">{r.reasons[0]}</span>}</span>
                <span role="cell" className="whitespace-nowrap py-1.5 pr-1 text-right" data-testid="my-week-paid">{r.paid + r.oldClock > 0 ? hm(r.paid + r.oldClock) : "–"}</span>
                <span role="cell" className="whitespace-nowrap py-1.5 pr-1 text-right" data-testid="my-week-breaks">{r.breaks > 0 ? hm(r.breaks) : "–"}</span>
                <span role="cell" className="whitespace-nowrap py-1.5 pr-1 text-right" data-testid="my-week-unpaid">{r.unpaid > 0 ? hm(r.unpaid) : "–"}</span>
              </button>
              {open && (
                <ul className="mb-2 space-y-0.5 rounded-lg bg-teal-500/5 p-2 text-xs" data-testid="my-week-day-detail">
                  {taps.length ? taps.map((e) => (
                    <li key={e.id} data-testid="my-week-tap">{tapWord[e.kind] || e.kind} {fmtTime(e.at)}{e.wasAt && e.wasAt !== e.at && <span data-testid="my-week-tap-was" className="ml-1 text-[var(--cr-muted)]">(was <s>{fmtTime(e.wasAt)}</s>)</span>}</li>
                  )) : <li>Hours from the old job clock or your boss.</li>}
                </ul>
              )}
            </div>
          );
        })}
        <div role="row" className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_4.75rem] border-t font-semibold" data-testid="my-week-total"><span className="py-1.5">Total</span><span className="whitespace-nowrap py-1.5 pr-1 text-right">{hm(total)}</span><span className="whitespace-nowrap py-1.5 pr-1 text-right">{hm(breaks)}</span><span /></div>
      </div>
      <div data-testid="attest" data-state={attested[week] ? "done" : "open"} className="text-sm">
        {attested[week] ? <p data-testid="attest-done">Week confirmed {new Date(attested[week]).toLocaleString()}.</p>
          : <button data-testid="attest-week" className="cr-btn cr-btn-primary min-h-11 w-full" onClick={attest}>I confirm these hours are correct</button>}
      </div>
      {note && <p data-testid="my-week-note" role="status" className="text-sm">{note}</p>}
    </section>
  );
}
