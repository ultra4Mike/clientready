"use client";

import { useState } from "react";
import { STATUS_LABEL, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

type Props = {
  value: Schedule | null;
  workers: Worker[];
  defaults?: { date?: string; startTime?: string };
  onSave: (schedule: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) => void;
  /** Called before people are removed; return false to keep them (e.g. they have hours logged). */
  confirmRemove?: (removedIds: string[]) => boolean;
  onCancel?: () => void;
  saveLabel?: string;
};

/** Date, start/end time, assigned workers and status for one job. */
export default function ScheduleEditor({ value, workers, defaults, onSave, onCancel, confirmRemove, saveLabel = "Save schedule" }: Props) {
  const [date, setDate] = useState(value?.date || defaults?.date || "");
  const [startTime, setStartTime] = useState(value?.startTime || defaults?.startTime || "");
  const [endTime, setEndTime] = useState(value?.endTime || "");
  const [workerIds, setWorkerIds] = useState<string[]>(value?.workerIds || []);
  const [status, setStatus] = useState<JobStatus>(value?.status || "scheduled");
  const [crewNote, setCrewNote] = useState(value?.crewNote || "");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const names = new Map(workers.map((person) => [person.id, person.name]));
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
    if (value) onSave({ ...value, workerIds: next }, { keepOpen: true, confirmed: removed });
  }

  function save() {
    if (!date) return setError("Pick a date.");
    if (startTime && endTime && endTime <= startTime) return setError("End time must be after the start time.");
    setError("");
    onSave({ date, startTime, ...(endTime ? { endTime } : {}), workerIds, status, updatedAt: value?.updatedAt || "", ...(crewNote.trim() ? { crewNote: crewNote.trim() } : {}) });
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
      <div data-testid="crew-chips">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span>Crew</span>
          <button type="button" onClick={() => { setPicked([]); setPicking(true); }} className="rounded-lg border border-teal-500 px-2 py-0.5 text-xs font-medium text-teal-600 dark:text-teal-300">+ Add crew</button>
        </div>
        {workerIds.length === 0 && <p className="text-xs opacity-70">No one assigned yet.</p>}
        <div className="flex flex-wrap gap-2">
          {workerIds.map((id) => (
            <span key={id} data-testid={`crew-chip-${id}`} className="inline-flex items-center gap-1 rounded-full border border-slate-400 px-2 py-0.5 text-xs">
              {names.get(id) || "Former worker"}
              <button type="button" aria-label={`Remove ${names.get(id) || "worker"}`} onClick={() => changeWorkers(workerIds.filter((item) => item !== id))} className="leading-none opacity-70 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
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
                    {person.name}{person.role ? <span className="text-xs opacity-60"> · {person.role}</span> : null}
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
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white">{saveLabel}</button>
        {value && <button type="button" onClick={() => onSave(null)} className="rounded-lg border border-slate-300 px-3 py-1.5">Unschedule</button>}
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5">Cancel</button>}
      </div>
    </div>
  );
}
