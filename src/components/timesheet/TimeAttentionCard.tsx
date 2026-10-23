"use client";
/** Dashboard > Needs attention: who's on the clock, missing clock-outs, missed breaks, pending fixes, late/no-show. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadTimeWeek, localYmd, timeAttention, type TimeAttention } from "@/lib/time-owner";

export default function TimeAttentionCard() {
  const [t, setT] = useState<TimeAttention | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { const now = new Date().toISOString(); void loadTimeWeek(localYmd(), now).then((w) => { if (live && w.workers.length) setT(timeAttention(w, now)); }).catch(() => undefined); };
    load();
    window.addEventListener("clientready:timesheet-changed", load);
    return () => { live = false; window.removeEventListener("clientready:timesheet-changed", load); };
  }, []);
  if (!t || (!t.onClock.length && !t.alerts.length)) return null;
  const word: Record<string, string> = { ON_DUTY_IDLE: "on duty", WORKING: "working", IN_TRANSIT: "driving", ON_BREAK: "on break" };
  return (
    <section className="cr-section rounded-xl border px-4 py-3 text-sm" data-testid="dash-time" data-state={t.alerts.length ? "attention" : "ok"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Time tracking</h3>
        <Link href="/timesheet" className="cr-btn cr-btn-text" data-testid="dash-time-open">Open timesheet</Link>
      </div>
      <p className="text-[var(--cr-muted)]" data-testid="dash-time-on-clock">On the clock now: <b className="tabular-nums">{t.onClock.length}</b>{t.onClock.length ? ` · ${t.onClock.map((o) => `${o.name} (${word[o.state] || o.state})`).join(", ")}` : ""}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.missingClockOuts > 0 && <span className="cr-chip2 cr-tone-warn" data-testid="dash-time-missing-out">{t.missingClockOuts} missing clock-out</span>}
        {t.missedBreaks > 0 && <span className="cr-chip2 cr-tone-bad" data-testid="dash-time-missed-breaks">{t.missedBreaks} missed break</span>}
        {t.pendingFixes > 0 && <span className="cr-chip2 cr-tone-warn" data-testid="dash-time-fixes">{t.pendingFixes} fix request{t.pendingFixes === 1 ? "" : "s"}</span>}
      </div>
      {t.alerts.length > 0 && <ul className="mt-1 space-y-0.5" data-testid="dash-time-alerts">{t.alerts.slice(0, 6).map((a, i) => (
        <li key={i} data-testid="dash-time-alert" data-kind={a.kind}><Link className="underline" href={`/timesheet?date=${a.date}`}>{a.name} · {a.date} · {a.text}</Link></li>
      ))}</ul>}
    </section>
  );
}
