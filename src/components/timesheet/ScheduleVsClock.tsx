"use client";
/** Calendar day view: each scheduled worker's scheduled hours vs clocked (timesheet) hours, late start / no-show. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { dayMinutes, loadTimeWeek, timeAttention, type TimeWeek } from "@/lib/time-owner";

export default function ScheduleVsClock({ date }: { date: string }) {
  const [w, setW] = useState<TimeWeek | null>(null);
  useEffect(() => { let live = true; if (date) void loadTimeWeek(date).then((x) => live && setW(x)).catch(() => undefined); return () => { live = false; }; }, [date]);
  if (!w) return null;
  const rows = w.workers.map((wk) => {
    const sched = w.schedule.get(`${wk.id}|${date}`) || [];
    const schedMin = sched.reduce((s, j) => s + Math.max(0, (Date.parse(j.end) - Date.parse(j.start)) / 60000), 0);
    return { wk, schedMin, clocked: dayMinutes(w, wk.id, date), taps: w.events.some((e) => e.employeeId === wk.id && e.date === date) };
  }).filter((r) => r.schedMin || r.clocked);
  if (!rows.length) return null;
  const alerts = timeAttention(w).alerts.filter((a) => a.date === date && (a.kind === "late_start" || a.kind === "no_show"));
  return (
    <section className="cr-section mb-4 rounded-xl border p-3 text-sm" data-testid="sched-vs-clock">
      <h2 className="font-semibold">Scheduled vs clocked</h2>
      <table className="mt-1 w-full"><thead><tr><th className="text-left">Worker</th><th className="text-right">Scheduled</th><th className="text-right">Clocked</th><th /></tr></thead>
        <tbody>{rows.map((r) => { const a = alerts.find((x) => x.employeeId === r.wk.id); return (
          <tr key={r.wk.id} className="border-t" data-testid={`svc-row-${r.wk.id}`} data-state={a?.kind || (r.taps ? "clocked" : "scheduled")}>
            <td><Link className="underline" href={`/timesheet?date=${date}`}>{r.wk.name}</Link></td>
            <td className="text-right tabular-nums">{(r.schedMin / 60).toFixed(2)} h</td>
            <td className="text-right tabular-nums" data-testid={`svc-clocked-${r.wk.id}`}>{(r.clocked / 60).toFixed(2)} h</td>
            <td className="text-right">{a && <span className={`cr-chip2 ${a.kind === "no_show" ? "cr-tone-bad" : "cr-tone-warn"}`} data-testid={`svc-${a.kind}`}>{a.kind === "no_show" ? "No-show" : "Late start"}</span>}</td>
          </tr>); })}</tbody></table>
    </section>
  );
}
