"use client";

import { overLimit, ownerOvertimeHours, weekScheduledHours } from "@/lib/overtime";
import { checklistFromLines } from "@/lib/checklist";
import { useEffect, useState, useSyncExternalStore } from "react";
import { refreshOwnerUnavailable, unavailableOn, type Unavailable } from "@/lib/unavailable";
import { bookedBlocks, bookingConflicts, clockText, nextOpenSlot, readOverrides, type Override } from "@/lib/conflicts";
import { STATUS_LABEL, TRAVEL_BUFFER_MINUTES, travelWarnings, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

function readDocsSafe(): { id: string; title?: string; data?: Record<string, unknown> }[] {
  try { return JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") || []; } catch { return []; }
}
const toMin = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const toHhmm = (total: number) => { const t = Math.max(0, Math.min(23 * 60 + 59, total)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

function watchOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

type Props = {
  value: Schedule | null;
  workers: Worker[];
  defaults?: { date?: string; startTime?: string };
  onSave: (schedule: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) => void;
  /** Called before people are removed; return false to keep them (e.g. they have hours logged). */
  confirmRemove?: (removedIds: string[]) => boolean;
  onCancel?: () => void;
  saveLabel?: string;
  /** This job, so it is not compared with itself for travel time. */
  docId?: string;
};

/** Date, start/end time, assigned workers and status for one job. */
export default function ScheduleEditor({ value, workers, defaults, onSave, onCancel, confirmRemove, saveLabel = "Save schedule", docId = "" }: Props) {
  const [date, setDate] = useState(value?.date || defaults?.date || "");
  const [startTime, setStartTime] = useState(value?.startTime || defaults?.startTime || "");
  const [endTime, setEndTime] = useState(value?.endTime || "");
  const [workerIds, setWorkerIds] = useState<string[]>(value?.workerIds || []);
  const [status, setStatus] = useState<JobStatus>(value?.status || "scheduled");
  const [crewNote, setCrewNote] = useState(value?.crewNote || "");
  const [checklistText, setChecklistText] = useState((value?.checklist || []).map((item) => item.text).join("\n"));
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [daysOff, setDaysOff] = useState<Unavailable[]>([]);
  useEffect(() => {
    let live = true;
    refreshOwnerUnavailable().then((rows) => { if (live) setDaysOff(rows); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const off = date ? unavailableOn(daysOff, date) : new Map<string, string>();
  const names = new Map(workers.map((person) => [person.id, person.name]));
  const travel = typeof window === "undefined" ? [] : travelWarnings(docId, date, startTime, endTime, workerIds);
  const [bookAnyway, setBookAnyway] = useState(false);
  const allDocs = typeof window === "undefined" ? [] : readDocsSafe();
  const draft = { date, startTime, endTime, workerIds, status, overrides: value?.overrides };
  const conflicts = bookingConflicts(allDocs, docId, draft);
  const blocks = bookedBlocks(allDocs, docId, date, workerIds);
  const overtimeLimit = ownerOvertimeHours();
  const overtime = date && workerIds.length ? overLimit(weekScheduledHours(allDocs, docId, { date, startTime, endTime, workerIds }), overtimeLimit).filter((row) => workerIds.includes(row.id)) : [];
  const length = startTime ? (endTime && endTime > startTime ? toMin(endTime) - toMin(startTime) : 60) : 60;
  const suggestion = conflicts.length ? nextOpenSlot(allDocs, docId, date, workerIds, length, startTime ? toMin(startTime) : undefined) || nextOpenSlot(allDocs, docId, date, workerIds, length) : "";
  function applySlot(slot: string) {
    const start = toMin(slot);
    setStartTime(slot);
    if (endTime || startTime) setEndTime(toHhmm(start + length));
    setBookAnyway(false);
  }
  // Not already on the job, by id or (for older duplicate employee records) by email.
  const takenEmails = new Set(workers.filter((person) => workerIds.includes(person.id)).map((person) => (person.email || "").trim().toLowerCase()).filter(Boolean));
  const available = workers.filter((person) => !workerIds.includes(person.id) && !takenEmails.has((person.email || "").trim().toLowerCase()));

  /** Chips update at once; a job that is already scheduled saves the new crew right away. */
  function changeWorkers(list: string[]) {
    const emails = new Map(workers.map((person) => [person.id, (person.email || "").trim().toLowerCase()]));
    const seen = new Set<string>();
    const next = list.filter((id) => {
      const key = emails.get(id) || `id:${id}`;
      if (seen.has(key) || seen.has(`id:${id}`)) return false;
      seen.add(key);
      seen.add(`id:${id}`);
      return true;
    });
    const removed = workerIds.filter((id) => !next.includes(id));
    if (removed.length && confirmRemove && !confirmRemove(removed)) return;
    setWorkerIds(next);
    // Adding someone who is already booked then: wait for Save (and Book anyway) instead of saving now.
    const clash = value ? bookingConflicts(readDocsSafe(), docId, { ...value, workerIds: next }) : [];
    if (value && !clash.length) onSave({ ...value, workerIds: next }, { keepOpen: true, confirmed: removed });
  }

  const offline = useSyncExternalStore(watchOnline, () => navigator.onLine === false, () => false);

  function save() {
    if (!date) return setError("Pick a date.");
    if (startTime && endTime && endTime <= startTime) return setError("End time must be after the start time.");
    if (conflicts.length && !bookAnyway) return setError("Someone on this job is already booked at that time. Pick another time, or tick Book anyway.");
    setError("");
    const at = new Date().toISOString();
    const overrides: Override[] = [...readOverrides(value?.overrides), ...(bookAnyway ? conflicts.map((c) => ({ workerId: c.workerId, otherDocId: c.docId, at })) : [])];
    onSave({ date, startTime, ...(endTime ? { endTime } : {}), workerIds, status, updatedAt: value?.updatedAt || "", ...(overrides.length ? { overrides } : {}), ...(crewNote.trim() ? { crewNote: crewNote.trim() } : {}), ...(checklistFromLines(checklistText, value?.checklist).length ? { checklist: checklistFromLines(checklistText, value?.checklist) } : {}) });
  }

  return (
    <div className="space-y-3 text-sm" data-testid="schedule-editor">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">Date<input aria-label="Job date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" /></label>
        <label className="flex flex-col gap-1">Start<input aria-label="Start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" /></label>
        <label className="flex flex-col gap-1">End<input aria-label="End time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" /></label>
        <label className="flex flex-col gap-1">Status
          <select aria-label="Job status" value={status} onChange={(event) => setStatus(event.target.value as JobStatus)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30">
            {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">Note for crew <span className="text-xs opacity-60">(shown to assigned crew only, not the customer)</span>
        <input aria-label="Note for crew" value={crewNote} maxLength={500} onChange={(event) => setCrewNote(event.target.value)} placeholder="Gate code, parking, what to bring…" className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
      </label>
      <label className="flex flex-col gap-1">Job-complete checklist <span className="text-xs opacity-60">(one per line; crew tick these before marking the job done)</span>
        <textarea aria-label="Job-complete checklist" data-testid="checklist-input" rows={3} value={checklistText} onChange={(event) => setChecklistText(event.target.value)} placeholder={"Blow off driveway\nClose the gate\nPhoto of the back yard"} className="min-h-20 rounded-md border border-slate-300 bg-transparent px-2.5 py-2 leading-relaxed text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
      </label>
      <div data-testid="crew-chips">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span>Crew</span>
          <button type="button" onClick={() => { setPicked([]); setPicking(true); }} className="tap rounded-lg border border-teal-500 px-2 py-0.5 text-xs font-medium text-teal-600 dark:text-teal-300">+ Add crew</button>
        </div>
        {workerIds.length === 0 && <p className="text-xs opacity-70">No one assigned yet.</p>}
        <div className="flex flex-wrap gap-2">
          {workerIds.map((id) => (
            <span key={id} data-testid={`crew-chip-${id}`} data-unavailable={off.has(id) ? "1" : undefined} className="inline-flex items-center gap-1 rounded-full border border-slate-400 px-2 py-0.5 text-xs">
              {names.get(id) || "Former worker"}
              <button type="button" aria-label={`Remove ${names.get(id) || "worker"}`} onClick={() => changeWorkers(workerIds.filter((item) => item !== id))} className="tap leading-none opacity-70 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
        {workerIds.some((id) => off.has(id)) && (
          <p role="alert" data-testid="unavail-warning" className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
            Marked unavailable on this day: {workerIds.filter((id) => off.has(id)).map((id) => `${names.get(id) || "Worker"}${off.get(id) ? ` (${off.get(id)})` : ""}`).join(", ")}
          </p>
        )}
        {blocks.length > 0 && (
          <ul className="mt-2 space-y-1.5 text-xs" data-testid="booked-blocks" aria-label="Already booked">
            {blocks.map((b) => {
              const clash = conflicts.some((c) => c.docId === b.docId && c.workerId === b.workerId);
              const near = !clash && travel.some((w) => w.workerId === b.workerId && w.otherTitle === b.title);
              return <li key={`${b.docId}-${b.workerId}`} data-testid="booked-block" data-state={clash ? "blocked" : near ? "warn" : "free"} data-doc-id={b.docId} className={`cr-booked rounded-md border px-2.5 py-1.5 tabular-nums ${clash ? "cr-booked-clash border-rose-400/60 font-semibold text-rose-700 dark:text-rose-300" : "border-slate-300/60 text-[var(--cr-muted)]"}`}>{names.get(b.workerId) || "Worker"} booked {clockText(b.start)}–{clockText(b.end)} · {b.title}</li>;
            })}
          </ul>
        )}
        {conflicts.length > 0 && (
          <div role="alert" data-testid="booking-conflict" data-state="blocked" className="cr-tone-warn mt-2 space-y-2 rounded-xl border border-amber-400 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-900">
            <p>Double-booked: {conflicts.map((c) => `${names.get(c.workerId) || "Worker"} is already on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("; ")}.</p>
            {suggestion && <button type="button" data-testid="next-open-slot" data-time={suggestion} onClick={() => applySlot(suggestion)} className="cr-slot-chip inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-500 px-4 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Use next open time: {clockText(toMin(suggestion))}</button>}
            <label className="cr-book-anyway flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-rose-400/60 px-3 py-2 text-sm font-medium text-rose-700"><input type="checkbox" data-testid="book-anyway" checked={bookAnyway} onChange={(event) => setBookAnyway(event.target.checked)} className="h-5 w-5" />Book anyway (they&apos;ll be on two jobs at once; this is saved on the job)</label>
          </div>
        )}
        {travel.length > 0 && (
          <p role="alert" data-testid="travel-warning" data-state="warn" className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
            Less than {TRAVEL_BUFFER_MINUTES} min travel time: {travel.map((w) => `${names.get(w.workerId) || "Worker"} ${w.gap < 0 ? "overlaps" : `has ${w.gap} min before/after`} ${w.otherTitle}`).join("; ")}. You can still save.
          </p>
        )}
        {overtime.length > 0 && (
          <p role="status" data-testid="overtime-warning" data-workers={overtime.map((row) => row.id).join(",")} className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
            Over {overtimeLimit} scheduled hours this week: {overtime.map((row) => `${names.get(row.id) || "Worker"} ${row.hours} hrs`).join("; ")}. You can still save.
          </p>
        )}
        {picking && (
          <div role="dialog" aria-label="Add crew" className="mt-2 rounded-lg border border-slate-400 bg-[var(--cr-card,white)] p-3 shadow-lg" data-testid="crew-picker">
            {workers.length === 0 ? (
              <p>No active employees. <a href="/employees" className="underline">Add people on the Employees page</a>.</p>
            ) : available.length === 0 ? (
              <p>Everyone active is already on this job.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {available.map((person) => (
                  <label key={person.id} className="flex items-center gap-2">
                    <input type="checkbox" aria-label={`Assign ${person.name}`} checked={picked.includes(person.id)} onChange={() => setPicked((current) => (current.includes(person.id) ? current.filter((item) => item !== person.id) : [...current, person.id]))} />
                    {person.name}{person.role ? <span className="text-xs opacity-60"> · {person.role}</span> : null}{off.has(person.id) ? <span className="text-xs text-amber-600" data-testid={`unavail-${person.id}`}> · unavailable</span> : null}
                  </label>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {available.length > 0 && <button type="button" disabled={!picked.length} onClick={() => { changeWorkers([...workerIds, ...picked]); setPicking(false); }} className="rounded-lg bg-slate-900 px-3 py-1 text-white disabled:opacity-50">Add</button>}
              <button type="button" onClick={() => setPicking(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Cancel</button>
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {offline && (
        <p role="status" data-testid="schedule-offline-note" data-crew={workerIds.length > 0 ? "1" : "0"} className="rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          No signal: this saves on this device only.{workerIds.length > 0 ? " Your crew won't see the change on their phones until you're back online." : " It syncs when you're back online."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white">{saveLabel}</button>
        {value && <button type="button" onClick={() => onSave(null)} className="rounded-lg border border-slate-300 px-3 py-1.5">Unschedule</button>}
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5">Cancel</button>}
      </div>
    </div>
  );
}
