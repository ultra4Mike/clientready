"use client";

import { useEffect, useState } from "react";
import { crewClearUnavailable, crewMyUnavailable, crewSetUnavailable, type Unavailable } from "@/lib/unavailable";

const input = "w-full rounded-xl border border-teal-500/30 bg-transparent px-3 py-3 text-base outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";
const pad = (n: number) => String(n).padStart(2, "0");
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Crew: mark own days off. Only this person's days are shown; the boss sees them when scheduling. */
export default function CrewDaysOff() {
  const [days, setDays] = useState<Unavailable[]>([]);
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let live = true;
    crewMyUnavailable().then((rows) => { if (live) setDays(rows); });
    return () => { live = false; };
  }, []);

  async function run(work: () => Promise<string>, ok: string) {
    setBusy(true);
    const error = await work();
    setBusy(false);
    setMsg(error ? `Could not save: ${error}` : ok);
    if (!error) setDays(await crewMyUnavailable());
  }

  return (
    <section className="rounded-2xl border border-teal-700/30 bg-[var(--cr-card)] p-4 shadow-sm dark:border-teal-500/20 sm:p-5" data-testid="crew-unavailable" aria-labelledby="days-off-title">
      <h2 id="days-off-title" className="text-lg font-bold tracking-tight">Days I can&apos;t work</h2>
      <p className="text-xs text-[var(--cr-muted)]">Your boss sees these when scheduling. Only you and your boss see them.</p>
      <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); if (!day) return setMsg("Pick a day."); void run(() => crewSetUnavailable(day, note.trim()), "Marked unavailable.").then(() => { setDay(""); setNote(""); }); }}>
        <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
          <label className="text-sm font-medium">Day<input type="date" name="unavailableDay" min={todayYmd()} data-testid="unavail-day" className={input} value={day} onChange={(event) => setDay(event.target.value)} /></label>
          <label className="text-sm font-medium">Note (optional)<input name="unavailableNote" maxLength={200} autoComplete="off" data-testid="unavail-note" className={input} placeholder="Doctor, family…" value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div>
        <button type="submit" disabled={busy} data-testid="unavail-add" className="min-h-11 w-full rounded-xl bg-teal-500 px-4 py-2.5 font-semibold text-slate-950! transition hover:bg-teal-400 disabled:opacity-50">Mark unavailable</button>
      </form>
      {msg && <p className="mt-2 text-sm" role="status" data-testid="unavail-msg">{msg}</p>}
      <ul className="mt-3 divide-y divide-teal-500/10 text-sm" data-testid="unavail-list">
        {days.length === 0 && <li className="py-2 text-[var(--cr-muted)]">No days marked.</li>}
        {days.map((row) => (
          <li key={row.day} className="flex items-center justify-between gap-2 py-2" data-testid="unavail-row" data-day={row.day}>
            <span>{label(row.day)}{row.note ? ` · ${row.note}` : ""}</span>
            <button type="button" disabled={busy} data-testid={`unavail-remove-${row.day}`} onClick={() => run(() => crewClearUnavailable(row.day), "Removed.")} className="rounded-lg border border-teal-500/30 px-3 py-1.5 font-medium max-sm:min-h-11">Remove</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
