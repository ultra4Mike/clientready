"use client";
import { useEffect, useState } from "react";

/** R112: shows the double-booking found when any job is saved, with a link to fix it. */
export default function ConflictToast() {
  const [note, setNote] = useState<{ docId: string; lines: string[] } | null>(null);
  useEffect(() => {
    const on = (event: Event) => {
      const detail = (event as CustomEvent).detail as { docId: string; lines: string[] };
      const key = `cr-conflict-seen:${detail.docId}:${detail.lines.join("|")}`;
      if (window.sessionStorage.getItem(key)) return; // shown once per clash per session
      window.sessionStorage.setItem(key, "1");
      setNote(detail);
    };
    window.addEventListener("clientready-conflict", on);
    return () => window.removeEventListener("clientready-conflict", on);
  }, []);
  if (!note) return null;
  return (
    <div role="alert" data-testid="conflict-toast" className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg print:hidden">
      <p className="font-semibold">Double-booked: someone on this job is also on {note.lines.join(", ")}</p>
      <div className="mt-2 flex gap-2">
        <a href={`/invoice?id=${encodeURIComponent(note.docId)}#schedule`} className="min-h-11 inline-flex items-center rounded-lg bg-amber-500 px-3 font-semibold text-slate-950!">Pick another time or worker</a>
        <button type="button" onClick={() => setNote(null)} className="min-h-11 rounded-lg border border-amber-500 px-3">Keep it</button>
      </div>
    </div>
  );
}
