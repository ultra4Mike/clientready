"use client";

import { addJobDay, dayDateProblem, dayLabel, jobDays, nextDayDate, removeJobDay, updateJobDay } from "@/lib/job-days";
import type { CrewRow, Schedule, Worker } from "@/lib/schedule";
import { useState } from "react";

type Props = { schedule: Schedule; crew: CrewRow[]; workers: Worker[]; onChange: (crew: CrewRow[]) => void; disabled?: boolean };
const input = "mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";
const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Days of a multi-day job (day 1 is set in the schedule above). Changes are saved with the document. */
export default function MultiDayEditor({ schedule, crew, workers, onChange, disabled }: Props) {
  const [problem, setProblem] = useState("");
  const days = jobDays(schedule, crew);
  const name = (id: string) => workers.find((w) => w.id === id)?.name || crew.find((r) => r.employeeId === id)?.name || "Worker";
  const pool = [...new Set([...workers.filter((w) => w.active !== false).map((w) => w.id), ...schedule.workerIds])];
  const first = days[0];
  const canAdd = !disabled && Boolean(first?.workerIds.length) && Boolean(nextDayDate(schedule, crew));
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3" data-testid="multi-day">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Days{days.length > 1 ? ` (${days.length})` : ""}</p>
        <button type="button" data-testid="add-day" disabled={!canAdd} className="min-h-11 rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 disabled:opacity-50 dark:text-teal-300"
          onClick={() => { const next = addJobDay(schedule, crew, workers); if (next) { setProblem(""); onChange(next); } }}>+ Add day</button>
      </div>
      {!first?.workerIds.length && <p className="text-xs text-slate-600">Assign crew above first; a new day starts with day 1&apos;s crew.</p>}
      {first && (
        <div className="rounded-md bg-slate-500/5 px-3 py-2 text-xs" data-testid="job-day-1">
          <span className="font-semibold">{days.length > 1 ? dayLabel(first) : "Day 1"}</span> · {pretty(first.date)}{first.startTime ? ` ${first.startTime}` : ""}{first.endTime ? `–${first.endTime}` : ""}
          {first.workerIds.length ? ` · ${first.workerIds.map(name).join(", ")}` : ""} <span className="opacity-70">(set in the schedule above)</span>
        </div>
      )}
      {days.slice(1).map((day) => (
        <div key={day.date} className="space-y-2 rounded-md border border-slate-200 p-3" data-testid={`job-day-${day.index}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" data-testid="day-label">{dayLabel(day)}</span>
            <button type="button" data-testid={`remove-day-${day.index}`} disabled={disabled} className="min-h-11 rounded-lg px-3 text-sm text-rose-700 underline disabled:opacity-50 dark:text-rose-300"
              onClick={() => { if (!day.locked || window.confirm("Hours already clocked or paid on this day stay on record. Remove the rest of this day?")) onChange(removeJobDay(schedule, crew, day.date)); }}>Remove day</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs text-slate-600">Date<input type="date" data-testid={`day-date-${day.index}`} className={input} value={day.date} disabled={disabled}
              min={schedule.date} onChange={(e) => { const p = dayDateProblem(schedule, crew, day.date, e.target.value); setProblem(p); if (!p) onChange(updateJobDay(schedule, crew, day.date, { date: e.target.value }, workers)); }} /></label>
            <label className="text-xs text-slate-600">Start<input type="time" data-testid={`day-start-${day.index}`} className={input} value={day.startTime} disabled={disabled}
              onChange={(e) => onChange(updateJobDay(schedule, crew, day.date, { startTime: e.target.value }, workers))} /></label>
            <label className="text-xs text-slate-600">End<input type="time" data-testid={`day-end-${day.index}`} className={input} value={day.endTime} disabled={disabled}
              onChange={(e) => onChange(updateJobDay(schedule, crew, day.date, { endTime: e.target.value }, workers))} /></label>
          </div>
          <fieldset className="flex flex-wrap gap-2 text-sm">
            <legend className="mb-1 text-xs text-slate-600">Crew this day</legend>
            {pool.map((id) => {
              const on = day.workerIds.includes(id);
              return (
                <label key={id} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 ${on ? "border-teal-500 bg-teal-500/10" : "border-slate-300"}`}>
                  <input type="checkbox" data-testid={`day-${day.index}-crew-${id}`} checked={on} disabled={disabled || (on && day.workerIds.length === 1)}
                    onChange={() => onChange(updateJobDay(schedule, crew, day.date, { workerIds: on ? day.workerIds.filter((x) => x !== id) : [...day.workerIds, id] }, workers))} />
                  {name(id)}
                </label>
              );
            })}
          </fieldset>
        </div>
      ))}
      {problem && <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">{problem}</p>}
      {days.length > 1 && <p className="text-xs text-slate-600">Save the document to keep day changes. Moving the job on the calendar moves every day together; clocked or paid hours stay put.</p>}
    </div>
  );
}
