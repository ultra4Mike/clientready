"use client";

import { useState } from "react";
import { STATUS_LABEL, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

type Props = {
  value: Schedule | null;
  workers: Worker[];
  defaults?: { date?: string; startTime?: string };
  onSave: (schedule: Schedule | null) => void;
  onCancel?: () => void;
  saveLabel?: string;
};

/** Date, start/end time, assigned workers and status for one job. */
export default function ScheduleEditor({ value, workers, defaults, onSave, onCancel, saveLabel = "Save schedule" }: Props) {
  const [date, setDate] = useState(value?.date || defaults?.date || "");
  const [startTime, setStartTime] = useState(value?.startTime || defaults?.startTime || "");
  const [endTime, setEndTime] = useState(value?.endTime || "");
  const [workerIds, setWorkerIds] = useState<string[]>(value?.workerIds || []);
  const [status, setStatus] = useState<JobStatus>(value?.status || "scheduled");
  const [error, setError] = useState("");
  const known = new Set(workers.map((person) => person.id));
  const missing = workerIds.filter((id) => !known.has(id));

  function toggle(id: string) {
    setWorkerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function save() {
    if (!date) return setError("Pick a date.");
    if (startTime && endTime && endTime <= startTime) return setError("End time must be after the start time.");
    setError("");
    onSave({ date, startTime, ...(endTime ? { endTime } : {}), workerIds, status, updatedAt: value?.updatedAt || "" });
  }

  return (
    <div className="space-y-3 text-sm" data-testid="schedule-editor">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">Date<input aria-label="Job date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-slate-300 bg-transparent px-2 py-1" /></label>
        <label className="flex flex-col gap-1">Start<input aria-label="Start time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="rounded border border-slate-300 bg-transparent px-2 py-1" /></label>
        <label className="flex flex-col gap-1">End<input aria-label="End time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="rounded border border-slate-300 bg-transparent px-2 py-1" /></label>
        <label className="flex flex-col gap-1">Status
          <select aria-label="Job status" value={status} onChange={(event) => setStatus(event.target.value as JobStatus)} className="rounded border border-slate-300 bg-transparent px-2 py-1">
            {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="mb-1">Workers</legend>
        {workers.length === 0 && <p className="text-xs opacity-70">Add people on the Employees page to assign them.</p>}
        <div className="flex flex-wrap gap-3">
          {workers.map((person) => (
            <label key={person.id} className="flex items-center gap-1">
              <input type="checkbox" aria-label={`Assign ${person.name}`} checked={workerIds.includes(person.id)} onChange={() => toggle(person.id)} />
              {person.name}
            </label>
          ))}
        </div>
        {missing.length > 0 && <p className="mt-1 text-xs opacity-70">{missing.length} assigned person no longer on your list (kept).</p>}
      </fieldset>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white">{saveLabel}</button>
        {value && <button type="button" onClick={() => onSave(null)} className="rounded-lg border border-slate-300 px-3 py-1.5">Unschedule</button>}
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1.5">Cancel</button>}
      </div>
    </div>
  );
}
