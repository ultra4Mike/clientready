"use client";

import { useEffect, useState } from "react";
import { confirmJobDone, jobDonePhotos, readSchedule, type Schedule } from "@/lib/schedule";

const when = (value?: string) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
};

/** Owner: the crew's "done" photos and the confirm button. Owner-only page; never on the customer copy. */
export default function JobDonePanel({ docId, schedule, onConfirmed }: { docId: string; schedule: Schedule | null; onConfirmed: (schedule: Schedule | null) => void }) {
  const [photos, setPhotos] = useState<{ id: string; worker_name: string; photo: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const done = schedule?.status === "done";

  useEffect(() => {
    let live = true;
    if (done) jobDonePhotos(docId).then((rows) => live && setPhotos(rows));
    return () => {
      live = false;
    };
  }, [docId, done, schedule?.doneAt]);

  if (!done || !schedule) return null;

  async function confirm() {
    setBusy(true);
    const saved = await confirmJobDone(docId).catch(() => null);
    setBusy(false);
    if (!saved) return setMessage("Could not confirm. Check your connection and try again.");
    onConfirmed(readSchedule(saved.data));
    setMessage("Job confirmed.");
  }

  return (
    <div id="job-done" className="print-hide space-y-2 rounded-xl border border-emerald-500/40 p-3 text-sm" data-testid="job-done-panel">
      <p className="font-semibold" data-testid="job-done-state">
        {schedule.confirmedAt ? `Done · confirmed ${when(schedule.confirmedAt)}` : `Done · awaiting your confirmation`}
      </p>
      {(schedule.doneBy || schedule.doneAt) && <p className="text-xs text-slate-500">Marked done{schedule.doneBy ? ` by ${schedule.doneBy}` : ""}{schedule.doneAt ? ` ${when(schedule.doneAt)}` : ""}</p>}
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="job-done-photos">
          {photos.map((item) => (
            <a key={item.id} href={item.photo} target="_blank" rel="noreferrer" title={item.worker_name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL photo from the crew */}
              <img src={item.photo} alt={`Finished job photo${item.worker_name ? ` by ${item.worker_name}` : ""}`} className="h-20 w-20 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No photos found for this job.</p>
      )}
      {!schedule.confirmedAt && (
        <button type="button" disabled={busy} onClick={confirm} data-testid="job-done-confirm" className="tap rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
          {busy ? "Confirming…" : "Confirm job done"}
        </button>
      )}
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
