"use client";
/**
 * One worker's day on the Timesheet: timeline (job starts, drives, paid/unpaid gaps, end), why it was flagged,
 * Looks right, approve / Use the schedule / Edit times, and that day's pending fix-my-time requests.
 * Edits recompute the day with the same engine (buildDay), then are saved as the day's edited minutes.
 */
import { useEffect, useState } from "react";
import { buildDay, fmtTime, hhmmTz, wallToIso, dayTimeline, daySummary, flagReasons, hm, type DaySheet, type FixRequest, type ScheduledJob, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";
import { loadAudit, type AuditRow, type DayApproval } from "@/lib/day-events";
import type { DayPay } from "@/lib/timesheet-pay";
import { KIND_LABEL } from "@/components/crew/MyDay";

/** Plain words for one audit row (no prices). */
const SETTING_LABEL: Record<string, string> = {
  gapMinutes: "Paid gap between jobs (min)", shortBreakPaidMinutes: "Short breaks paid up to (min)", breakPreset: "Break rules", payFirstCommute: "Pay travel to first job",
  payLastCommute: "Pay drive home", commuteDeductMinutes: "Normal commute taken off (min)", roundingMinutes: "Rounding (min)", geofenceMeters: "Job site radius (m)", geofenceOptOut: "Location check off",
  otPreset: "Overtime rules", weeklyOtHours: "Weekly overtime after (h)", dailyOtHours: "Daily overtime after (h)", dailyDtHours: "Double time after (h)", seventhDayRule: "7th-day rule",
  payPeriod: "Pay period", remindMissedStartMinutes: "Missed start reminder (min)", remindMissedEndMinutes: "Missed end reminder (min)", autoMealMinutes: "Auto meal break (min)",
  autoMealAfterHours: "Auto meal break after (h)", caPremiumPay: "California premium pay", longDriveBreakMinutes: "Long drive limit (min)", transitTimeoutMinutes: "\u201cStill driving?\u201d after (min)",
  halfDayHours: "Half day (h)", hireDate: "Hire date",
};
export const settingLabel = (k: string) => SETTING_LABEL[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
const settingValue = (x: unknown) => (x === true ? "on" : x === false ? "off" : x == null || x === "" ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x));
const settingDiff = (o: Record<string, unknown>, v: Record<string, unknown>) => Object.keys(v).map((k) => `${settingLabel(k)} ${settingValue(o[k])} → ${settingValue(v[k])}`).join("; ");
const kindLabel = (k: unknown) => KIND_LABEL[k as keyof typeof KIND_LABEL] || String(k ?? "").replace(/_/g, " ");

export function auditText(r: AuditRow) {
  const v = (r.newValue || {}) as Record<string, unknown>; const o = (r.oldValue || {}) as Record<string, unknown>;
  const t = (x: unknown) => (typeof x === "string" && x ? fmtTime(x) : "");
  const mins = (x: unknown) => (typeof x === "number" ? hm(x) : "—");
  switch (r.action) {
    case "tap": return `Tap: ${kindLabel(v.kind)} at ${t(v.at)}${v.device_at && Math.abs(new Date(String(v.device_at)).getTime() - new Date(String(v.at)).getTime()) > 300000 ? ` (phone said ${t(v.device_at)})` : ""}${v.offline ? " · sent later (offline)" : ""}${v.out_of_order ? " · out of order" : ""}${v.not_at_site ? " · not at site" : ""}`;
    case "tap_edit": return `Tap changed: ${kindLabel(o.kind)} ${t(o.at)} → ${kindLabel(v.kind)} ${t(v.at)}`;
    case "tap_delete": return `Tap removed: ${kindLabel(o.kind)} ${t(o.at)}`;
    case "fix_request": return `Fix requested: ${kindLabel(v.kind)} → ${t(v.at)} “${v.reason || ""}”`;
    case "fix_approved": case "fix_denied": return `Fix ${r.action === "fix_approved" ? "approved" : "declined"}${v.note ? `: “${v.note}”` : ""}`;
    case "approve": return `Approved ${mins(v.paidMinutes)}`;
    case "edit_approve": return `Edited ${mins(o.editedMinutes ?? o.paidMinutes)} → ${mins(v.editedMinutes)} and approved${v.note ? ` · ${v.note}` : ""}`;
    case "edit": return `Edited ${mins(o.editedMinutes ?? o.paidMinutes)} → ${mins(v.editedMinutes)}${o.approved ? " (reopened)" : ""}${v.note ? ` · ${v.note}` : ""}`;
    case "unapprove": return "Approval undone";
    case "attest": return `Worker confirmed the week (${mins(v.minutes)})`;
    case "settings": return `Rules changed: ${settingDiff(o, v)}`;
    case "worker_rules": return `Worker time settings: ${settingDiff(o, v)}`;
    default: return r.action;
  }
}

const hhmm = (iso: string) => (iso ? hhmmTz(iso) : ""); // account time zone
const atTime = (date: string, t: string) => wallToIso(date, t);

export default function DayDetail(props: {
  worker?: import("@/lib/timesheet").WorkerTimeOverrides;
  workerName: string; date: string; sheet?: DaySheet; approval?: DayApproval; minutes: number; extraFlags: string[];
  settings: TimesheetSettings; schedule: ScheduledJob[]; fixes: FixRequest[];
  employeeId?: string; taps?: TapEvent[]; dayPay?: DayPay;
  onApprove: () => void; onUnapprove: () => void; onSetMinutes: (minutes: number, approve: boolean, note?: string) => void;
  onDecide: (fix: FixRequest, status: "approved" | "denied", note?: string) => void; onClose: () => void;
}) {
  const [history, setHistory] = useState<AuditRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { if (history === null && props.employeeId) void loadAudit({ employeeId: props.employeeId, date: props.date, limit: 100 }).then(setHistory); }, [history, props.employeeId, props.date]);
  const { sheet, date, settings } = props;
  const [editing, setEditing] = useState(false);
  // Editor rows: the day's jobs; a day with taps but no job span (e.g. Start day / breaks only) gets one "Day" row
  // from the first to the last tap, so reopening never loses the start time.
  const [spans, setSpans] = useState(() => {
    const jobs = (sheet?.jobs || []).map((j) => ({ docId: j.docId, label: j.label, start: hhmm(j.start), end: hhmm(j.end) }));
    if (jobs.length) return jobs;
    const taps = [...(props.taps || [])].sort((a, b) => a.at.localeCompare(b.at));
    const first = taps[0]?.at, last = taps[taps.length - 1]?.at;
    return first ? [{ docId: "day", label: "Day", start: hhmm(first), end: last && last !== first ? hhmm(last) : "" }] : [];
  });
  const [hours, setHours] = useState(() => (props.minutes / 60).toFixed(2));
  const timeline = dayTimeline(sheet);
  const reasons = flagReasons(sheet, props.extraFlags, settings);
  const pending = props.fixes.filter((f) => f.status === "pending");
  const approved = Boolean(props.approval?.approvedAt);
  // Same engine as the taps: edited job times become the day's "schedule" with no taps.
  const valid = (list: typeof spans) => list.some((s) => s.start && s.end && s.end > s.start);
  // Only recompute paid hours from complete times; a half-filled row keeps the current hours (never "0 m").
  const onSpans = (next: typeof spans) => { setSpans(next); if (valid(next)) setHours((recalc(next) / 60).toFixed(2)); };
  const recalc = (list: typeof spans) => buildDay({ employeeId: "x", date, events: [], settings, worker: props.worker, schedule: list.filter((s) => s.start && s.end && s.end > s.start).map((s) => ({ docId: s.docId, label: s.label, start: atTime(date, s.start), end: atTime(date, s.end) })) }).paidMinutes;
  const scheduleMinutes = props.schedule.length ? buildDay({ employeeId: "x", date, events: [], settings, worker: props.worker, schedule: props.schedule }).paidMinutes : null;
  const editedMinutes = props.approval?.editedMinutes;
  const btn = "min-h-11 rounded-lg border px-3 text-sm";
  // Esc closes the day detail.
  const { onClose } = props;
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`${props.workerName} ${date}`} onClick={props.onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--cr-panel)] p-4 text-sm text-[var(--cr-text)] shadow-xl sm:rounded-2xl" data-testid="ts-daydetail" onClick={(e) => e.stopPropagation()}>
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
              <li key={i} className={row.kind === "gap" ? (row.paid ? "text-[var(--cr-muted)]" : "font-medium text-amber-700 dark:text-amber-300") : row.fromSchedule ? "text-amber-700 dark:text-amber-300" : ""} data-testid={`ts-dd-row-${row.kind}`}>{row.kind === "gap" ? "↳ " : ""}{row.text}</li>
            ))}
          </ol>
        ) : <p className="mb-3 text-[var(--cr-muted)]">No taps or scheduled jobs this day.</p>}
        <div className="mb-3 flex flex-wrap gap-1" data-testid="ts-dd-pills">
          {props.dayPay?.otHours ? <span className="cr-chip2 cr-tone-warn" data-testid="ts-dd-pill-ot">OT {props.dayPay.otHours.toFixed(2)} h</span> : null}
          {props.dayPay?.dtHours ? <span className="cr-chip2 cr-tone-bad" data-testid="ts-dd-pill-dt">DT {props.dayPay.dtHours.toFixed(2)} h</span> : null}
          {sheet?.premiumHours ? <span className="cr-chip2 cr-tone-warn" data-testid="ts-dd-pill-premium">Break premium {sheet.premiumHours} h</span> : null}
          {sheet?.flags.some((f) => f === "meal_missed" || f === "rest_missed") ? <span className="cr-chip2 cr-tone-bad" data-testid="ts-dd-pill-break">Break rule</span> : null}
          {editedMinutes != null ? <span className="cr-chip2" data-testid="ts-dd-pill-edited">Edited</span> : null}
        </div>
        {sheet && (sheet.breaks.length > 0 || sheet.roundingMinutes !== 0 || sheet.autoBreakMinutes > 0) && (
          <div className="cr-panel mb-3 space-y-1" data-testid="ts-dd-breaks">
            {sheet.breaks.map((b, i) => <p key={i} data-testid="ts-dd-break" data-state={b.paid ? "paid" : "unpaid"}>{b.auto ? "Auto meal break" : "Break"} {hhmm(b.start)}–{hhmm(b.end)} · {hm(b.minutes)} · {b.paid ? "paid" : `${hm(b.unpaidMinutes)} unpaid`}</p>)}
            {sheet.autoBreakMinutes > 0 && (
              <p data-testid="ts-dd-long-drive">Long drive: {sheet.autoBreakMinutes} min not paid.{" "}
                {!approved && <button className="cr-btn-text" data-testid="ts-dd-pay-drive" onClick={() => props.onSetMinutes(props.minutes + sheet.autoBreakMinutes, false)}>Pay the full drive</button>}</p>
            )}
            {sheet.roundingMinutes !== 0 && <p data-testid="ts-dd-rounding">Rounding ({settings.roundingMinutes} min): {sheet.roundingMinutes > 0 ? "+" : ""}{sheet.roundingMinutes} min</p>}
          </div>
        )}
        {props.taps && props.taps.length > 0 && (
          <details className="cr-collapse mb-3" data-testid="ts-dd-taps">
            <summary>Taps ({props.taps.length})</summary>
            <ul className="mt-1 space-y-1">
              {[...props.taps].sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
                <li key={e.id} data-testid="ts-dd-tap" data-kind={e.kind}>{hhmm(e.at)} · {KIND_LABEL[e.kind]}{e.outOfOrder ? " · out of order" : ""}{e.notAtSite ? " · not at site" : ""}
                  {e.lat != null && e.lng != null && <> · <span data-testid={`ts-dd-pin-${e.id}`}><a className="underline" target="_blank" rel="noopener noreferrer" data-testid="ts-dd-map" href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`}>Map</a></span></>}</li>
              ))}
            </ul>
          </details>
        )}
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
                <span>{kindLabel(f.kind)} → {fmtTime(f.at)} · “{f.reason}”</span>
                <input aria-label="Note to worker" placeholder="Note to worker (optional)" name="ts-dd-fix-note" data-testid="ts-dd-fix-note" maxLength={300} className="min-h-9 flex-1 rounded border bg-transparent px-2" value={notes[f.id] || ""} onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })} />
                <button className="cr-btn cr-btn-primary" data-testid="ts-dd-fix-approve" onClick={() => props.onDecide(f, "approved", notes[f.id])}>Approve</button>
                <button className="cr-btn cr-btn-secondary" data-testid="ts-dd-fix-deny" onClick={() => props.onDecide(f, "denied", notes[f.id])}>Decline</button>
              </div>
            ))}
          </div>
        )}
        {editing ? (
          <div className="mb-3 space-y-2 rounded-lg border p-2" data-testid="ts-dd-editor">
            {spans.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="min-w-20 font-medium">{s.label || "Job"}</span>
                <input type="time" aria-label={`${s.label || "Job"} start`} name={`ts-dd-start-${i}`} data-testid={`ts-dd-start-${i}`} className="min-h-11 rounded border bg-transparent px-2" value={s.start} onChange={(e) => onSpans(spans.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <span>to</span>
                <input type="time" aria-label={`${s.label || "Job"} end`} name={`ts-dd-end-${i}`} data-testid={`ts-dd-end-${i}`} className="min-h-11 rounded border bg-transparent px-2" value={s.end} onChange={(e) => onSpans(spans.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              </div>
            ))}
            <label className="flex items-center gap-2">Paid hours<input aria-label="Paid hours" name="ts-edit-hours" data-testid="ts-edit-hours" className="min-h-11 w-24 rounded border bg-transparent px-2" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white" data-testid="ts-edit-save" onClick={() => { props.onSetMinutes(Math.max(0, Number(hours) * 60 || 0), false, spans.filter((x) => x.start || x.end).map((x) => `${x.label || "Job"} ${x.start || "?"}–${x.end || "?"}`).join(", ")); setEditing(false); }}>Save</button>
              <button className={btn} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {approved
            ? <button className={btn} data-testid="ts-dd-unapprove" onClick={props.onUnapprove}>Unapprove</button>
            : <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white disabled:opacity-50" disabled={!props.minutes} data-testid="ts-dd-approve" onClick={props.onApprove}>Looks right, approve</button>}
          {approved && <span className="cr-chip2 cr-tone-good" data-testid="ts-dd-locked" data-state="locked">Locked: reopen or unapprove to change</span>}
          {!approved && scheduleMinutes != null && <button className={btn} data-testid="ts-dd-schedule" onClick={() => props.onSetMinutes(scheduleMinutes, true)} title={`Use the scheduled ${hm(scheduleMinutes)} and approve`}>Use the schedule ({hm(scheduleMinutes)})</button>}
          {!editing && <button className={btn} data-testid="ts-dd-edit" data-state={approved ? "reopen" : "edit"} onClick={() => setEditing(true)}>{approved ? "Reopen and edit" : "Edit times"}</button>}
        </div>
        <details className="cr-collapse mt-3" data-testid="ts-dd-history">
          <summary>History</summary>
          {history && history.length ? (
            <ol className="mt-1 space-y-1 border-l-2 pl-3">
              {history.map((r, i) => <li key={r.id || i} data-testid="ts-dd-history-row" data-action={r.action}><span className="text-[var(--cr-muted)]">{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {r.actor || "system"}</span> · {auditText(r)}</li>)}
            </ol>
          ) : <p className="mt-1 text-[var(--cr-muted)]" data-testid="ts-dd-history-empty">No changes recorded yet.</p>}
        </details>
      </div>
    </div>
  );
}
