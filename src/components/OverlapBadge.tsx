"use client";
import { useState } from "react";
import { clockText, conflictsForDoc, moveToNextOpen } from "@/lib/conflicts";
import { derivedWhen } from "@/lib/job-when";
import { type Schedule, moveSchedule, readSchedule, saveSchedule, readWorkers } from "@/lib/schedule";

type Doc = { id: string; title?: string; data?: Record<string, unknown> };

/** R112: shows an existing same-worker overlap on this job, with one tap to move it to the next open time. */
export default function OverlapBadge({ docs, doc, onMoved }: { docs: Doc[]; doc: Doc; onMoved?: () => void }) {
  const [state, setState] = useState("");
  const clash = conflictsForDoc(docs, doc);
  if (!clash.length && !state) return null;
  if (!clash.length) return <span role="status" data-testid="overlap-moved" className="text-xs text-emerald-700">{state}</span>;
  const names = new Map(readWorkers().map((w) => [w.id, w.name]));
  const text = clash.map((c) => `${names.get(c.workerId) || "Worker"} is also on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("; ");
  const slot = moveToNextOpen(docs, doc);
  async function move() {
    const when = derivedWhen(doc.data);
    const current = readSchedule(doc.data) || (when ? ({ date: when.date, startTime: when.startTime, workerIds: when.workerIds, status: "scheduled", updatedAt: "" } as unknown as Schedule) : null);
    if (!slot || !current) return;
    setState("Moving…");
    const saved = await saveSchedule(doc.id, { ...moveSchedule(current, current.date, slot.startTime), endTime: slot.endTime }).catch(() => null);
    setState(saved ? `Moved to ${clockText(Number(slot.startTime.slice(0, 2)) * 60 + Number(slot.startTime.slice(3)))}` : "Could not move. Try again.");
    onMoved?.();
  }
  return (
    <span data-testid="overlap-badge" data-doc={doc.id} className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <span>⚠ Overlap: {text}</span>
      {slot && <button type="button" data-testid="overlap-move" onClick={move} className="min-h-11 rounded-md bg-amber-500 px-3 font-semibold text-slate-950!">Move to next open time</button>}
    </span>
  );
}
