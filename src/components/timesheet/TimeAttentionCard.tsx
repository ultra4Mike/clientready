"use client";
/** Dashboard > Needs attention: who's on the clock, missing clock-outs, missed breaks, pending fixes, late/no-show. */
import { TIMESHEET_CHANGED_EVENT } from "@/lib/timesheet-sync";
import { useEffect, useState } from "react";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { DAY_APPROVALS_KEY } from "@/lib/day-events";
import Link from "next/link";
import { loadPtoRequests } from "@/lib/phase2-data";
import { loadTimeWeek, localYmd, timeAttention, type TimeAttention } from "@/lib/time-owner";

export default function TimeAttentionCard() {
  const [t, setT] = useState<TimeAttention | null>(null);
  const [ptoPending, setPtoPending] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => { const now = new Date().toISOString(); void loadTimeWeek(localYmd(), now).then((w) => { if (live) setT(w.workers.length ? timeAttention(w, now) : null); }).catch(() => undefined); void loadPtoRequests(localYmd().slice(0, 4)).then((r) => { if (live) setPtoPending(r.filter((x) => x.status === "pending").length); }).catch(() => undefined); };
    load();
    window.addEventListener(TIMESHEET_CHANGED_EVENT, load);
    return () => { live = false; window.removeEventListener(TIMESHEET_CHANGED_EVENT, load); };
  }, []);
  // pt473u: the phone and the web must agree. Re-read on focus / visible / online / every minute (keeps what's shown
  // until the server copy lands, so no flash); resolved days on another device drop off here too.
  useLiveRefresh(() => { const now = new Date().toISOString(); void loadTimeWeek(localYmd(), now).then((w) => setT(w.workers.length ? timeAttention(w, now) : null)).catch(() => undefined); void loadPtoRequests(localYmd().slice(0, 4)).then((r) => setPtoPending(r.filter((x) => x.status === "pending").length)).catch(() => undefined); }, { storageKeys: [DAY_APPROVALS_KEY] });
  if ((!t || (!t.onClock.length && !t.alerts.length)) && !ptoPending) return null;
  if (!t) return (
    <section className="cr-section rounded-xl border px-4 py-3 text-sm" data-testid="dash-time" data-state="attention"><Link href="/timesheet#pto" className="cr-chip2 cr-tone-warn" data-testid="dash-time-pto">{ptoPending} time-off request{ptoPending === 1 ? "" : "s"} waiting</Link></section>);
  const word: Record<string, string> = { ON_DUTY_IDLE: "on duty", WORKING: "working", IN_TRANSIT: "driving", ON_BREAK: "on break" };
  return (
    <section className="cr-section rounded-xl border px-4 py-3 text-sm" data-testid="dash-time" data-state={t.alerts.length || ptoPending ? "attention" : "ok"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Time tracking</h3>
        <Link href="/timesheet" className="cr-btn cr-btn-text" data-testid="dash-time-open">Open timesheet</Link>
      </div>
      <p className="text-[var(--cr-muted)]" data-testid="dash-time-on-clock">On the clock now: <b className="tabular-nums">{t.onClock.length}</b>{t.onClock.length ? ` · ${t.onClock.map((o) => `${o.name} (${word[o.state] || o.state})`).join(", ")}` : ""}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {t.missingClockOuts > 0 && <span className="cr-chip2 cr-tone-warn" data-testid="dash-time-missing-out">{t.missingClockOuts} missing clock-out{t.missingClockOuts === 1 ? "" : "s"}</span>}
        {t.missedBreaks > 0 && <span className="cr-chip2 cr-tone-bad" data-testid="dash-time-missed-breaks">{t.missedBreaks} missed break{t.missedBreaks === 1 ? "" : "s"}</span>}
        {t.noShows > 0 && <Link href="/timesheet?filter=review" className="cr-chip2 cr-tone-bad" data-testid="dash-time-no-shows">{t.noShows} no-show{t.noShows === 1 ? "" : "s"}</Link>}
        {t.lateStarts > 0 && <Link href="/timesheet?filter=review" className="cr-chip2 cr-tone-warn" data-testid="dash-time-late">{t.lateStarts} late start{t.lateStarts === 1 ? "" : "s"}</Link>}
        {t.needsReview > 0 && <Link href="/timesheet?filter=review" className="cr-chip2 cr-tone-warn" data-testid="dash-time-review">{t.needsReview} day{t.needsReview === 1 ? "" : "s"} need{t.needsReview === 1 ? "s" : ""} review</Link>}
        {ptoPending > 0 && <Link href="/timesheet#pto" className="cr-chip2 cr-tone-warn" data-testid="dash-time-pto">{ptoPending} time-off request{ptoPending === 1 ? "" : "s"} waiting</Link>}
        {t.pendingFixes > 0 && <span className="cr-chip2 cr-tone-warn" data-testid="dash-time-fixes">{t.pendingFixes} fix request{t.pendingFixes === 1 ? "" : "s"}</span>}
      </div>
      {t.alerts.length > 0 && <ul className="mt-1 space-y-0.5" data-testid="dash-time-alerts">{t.alerts.slice(0, 6).map((a, i) => (
        <li key={i} data-testid="dash-time-alert" data-kind={a.kind}><Link className="underline" href={`/timesheet?date=${a.date}`}>{a.name} · {a.date} · {a.text}</Link></li>
      ))}</ul>}
    </section>
  );
}
