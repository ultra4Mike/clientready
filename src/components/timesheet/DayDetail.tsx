"use client";
/**
 * One worker's day on the Timesheet: timeline (job starts, drives, paid/unpaid gaps, end), why it was flagged,
 * Looks right, approve / Use the schedule / Edit times, and that day's pending fix-my-time requests.
 * Edits recompute the day with the same engine (buildDay), then are saved as the day's edited minutes.
 */
import { useState } from "react";
import { buildDay, dayTimeline, daySummary, flagReasons, hm, type DaySheet, type FixRequest, type ScheduledJob, type TimesheetSettings } from "@/lib/timesheet";
import type { DayApproval } from "@/lib/day-events";

const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const atTime = (date: string, t: string) => new Date(`${date}T${t}:00`).toISOString();

export default function DayDetail(props: {
  workerName: string; date: string; sheet?: DaySheet; approval?: DayApproval; minutes: number; extraFlags: string[];
  settings: TimesheetSettings; schedule: ScheduledJob[]; fixes: FixRequest[];
  onApprove: () => void; onUnapprove: () => void; onSetMinutes: (minutes: number, approve: boolean) => void;
  onDecide: (fix: FixRequest, status: "approved" | "denied") => void; onClose: () => void;
}) {
  const { sheet, date, settings } = props;
  const [editing, setEditing] = useState(false);
  const [spans, setSpans] = useState(() => (sheet?.jobs || []).map((j) => ({ docId: j.docId, label: j.label, start: hhmm(j.start), end: hhmm(j.end) })));
  const [hours, setHours] = useState(() => (props.minutes / 60).toFixed(2));
  const timeline = dayTimeline(sheet);
  const reasons = flagReasons(sheet, props.extraFlags, settings);
  const pending = props.fixes.filter((f) => f.status === "pending");
  const approved = Boolean(props.approval?.approvedAt);
  // Same engine as the taps: edited job times become the day's "schedule" with no taps.
  const recalc = (list: typeof spans) => buildDay({ employeeId: "x", date, events: [], settings, schedule: list.filter((s) => s.start && s.end).map((s) => ({ docId: s.docId, label: s.label, start: atTime(date, s.start), end: atTime(date, s.end) })) }).paidMinutes;
  const scheduleMinutes = props.schedule.length ? buildDay({ employeeId: "x", date, events: [], settings, schedule: props.schedule }).paidMinutes : null;
  const editedMinutes = props.approval?.editedMinutes;
  const btn = "min-h-11 rounded-lg border px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`${props.workerName} ${date}`} onClick={props.onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--cr-bg,#fff)] p-4 text-sm shadow-xl sm:rounded-2xl" style={{ background: "var(--cr-surface, white)" }} data-testid="ts-daydetail" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">{props.workerName}</h2>
            <p className="text-[var(--cr-muted)]">{new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}{approved && <span className="ml-2 text-emerald-600" data-testid="ts-dd-approved">✓ Approved</span>}</p>
          </div>
          <button className="min-h-11 px-3 text-lg" aria-label="Close" data-testid="ts-dd-close" onClick={props.onClose}>×</button>
        </div>
        <p className="mb-3 rounded-lg bg-teal-500/10 p-2 font-medium" data-testid="ts-dd-summary">{daySummary(sheet, editedMinutes ?? (approved ? props.approval!.paidMinutes : null))}</p>
        {timeline.length ? (
          <ol className="mb-3 space-y-1 border-l-2 border-teal-500/30 pl-3" data-testid="ts-dd-timeline">
            {timeline.map((row, i) => (
              <li key={i} className={row.kind === "gap" ? (row.paid ? "text-[var(--cr-muted)]" : "font-medium text-amber-700") : row.fromSchedule ? "text-amber-700" : ""} data-testid={`ts-dd-row-${row.kind}`}>{row.kind === "gap" ? "↳ " : ""}{row.text}</li>
            ))}
          </ol>
        ) : <p className="mb-3 text-[var(--cr-muted)]">No taps or scheduled jobs this day.</p>}
        {reasons.length > 0 && (
          <div className="mb-3 space-y-1" data-testid="ts-dd-why">
            <p className="font-semibold">Why this day is flagged</p>
            {reasons.map((r) => <p key={r.flag} className="rounded bg-amber-500/15 px-2 py-1" data-testid={`ts-flag-${r.flag}`}>{r.text}</p>)}
          </div>
        )}
        {pending.length > 0 && (
          <div className="mb-3 space-y-2" data-testid="ts-dd-fixes">
            <p className="font-semibold">Fix-my-time requests</p>
            {pending.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <span>{f.kind.replace("_", " ")} → {new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · “{f.reason}”</span>
                <button className="min-h-9 rounded bg-teal-600 px-3 text-white" data-testid="ts-dd-fix-approve" onClick={() => props.onDecide(f, "approved")}>Approve</button>
                <button className="min-h-9 rounded border px-3" data-testid="ts-dd-fix-deny" onClick={() => props.onDecide(f, "denied")}>Deny</button>
              </div>
            ))}
          </div>
        )}
        {editing ? (
          <div className="mb-3 space-y-2 rounded-lg border p-2" data-testid="ts-dd-editor">
            {spans.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="min-w-20 font-medium">{s.label || "Job"}</span>
                <input type="time" aria-label={`${s.label || "Job"} start`} data-testid={`ts-dd-start-${i}`} className="min-h-11 rounded border bg-transparent px-2" value={s.start} onChange={(e) => { const next = spans.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)); setSpans(next); setHours((recalc(next) / 60).toFixed(2)); }} />
                <span>to</span>
                <input type="time" aria-label={`${s.label || "Job"} end`} data-testid={`ts-dd-end-${i}`} className="min-h-11 rounded border bg-transparent px-2" value={s.end} onChange={(e) => { const next = spans.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)); setSpans(next); setHours((recalc(next) / 60).toFixed(2)); }} />
              </div>
            ))}
            <label className="flex items-center gap-2">Paid hours<input aria-label="Paid hours" data-testid="ts-edit-hours" className="min-h-11 w-24 rounded border bg-transparent px-2" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white" data-testid="ts-edit-save" onClick={() => { props.onSetMinutes(Math.max(0, Number(hours) * 60 || 0), false); setEditing(false); }}>Save</button>
              <button className={btn} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {approved
            ? <button className={btn} data-testid="ts-dd-unapprove" onClick={props.onUnapprove}>Unapprove</button>
            : <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white disabled:opacity-50" disabled={!props.minutes} data-testid="ts-dd-approve" onClick={props.onApprove}>Looks right, approve</button>}
          {scheduleMinutes != null && <button className={btn} data-testid="ts-dd-schedule" onClick={() => props.onSetMinutes(scheduleMinutes, true)} title={`Use the scheduled ${hm(scheduleMinutes)} and approve`}>Use the schedule ({hm(scheduleMinutes)})</button>}
          {!editing && <button className={btn} data-testid="ts-dd-edit" onClick={() => setEditing(true)}>Edit times</button>}
        </div>
      </div>
    </div>
  );
}
