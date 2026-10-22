"use client";

import { useEffect, useState } from "react";
import FormDraft from "@/components/FormDraft";
import { crewSaveVisitNote, jobVisitNotes } from "@/lib/schedule";

/** R88: crew's visit note for one job (only theirs; the boss sees it on the job). */
export default function CrewVisitNote({ docId }: { docId: string }) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { let live = true; jobVisitNotes(docId).then((rows) => { if (live && rows[0]) { setNote(rows[0].note); setSaved(rows[0].note); } }).catch(() => {}).finally(() => { if (live) setLoaded(true); }); return () => { live = false; }; }, [docId]);
  async function save() {
    const error = await crewSaveVisitNote(docId, note);
    if (error) { setMessage(error); return; }
    setSaved(note); setMessage("Note saved for your boss.");
  }
  return (
    <div className="space-y-1" data-testid={`visit-note-${docId}`}>
      <FormDraft form="crew-visit-note" id={docId} enabled={loaded} value={{ note }} blank={{ note: "" }} onRestore={(v) => setNote(v.note)} what="visit note" />
      <label className="text-sm font-medium" htmlFor={`visit-note-input-${docId}`}>Visit notes</label>
      <textarea id={`visit-note-input-${docId}`} data-testid={`visit-note-input-${docId}`} rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you did, what's left, gate code…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <button type="button" data-testid={`visit-note-save-${docId}`} disabled={note === saved} onClick={save} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Save note</button>
      {message && <p role="status" className="text-xs text-[var(--cr-muted)]">{message}</p>}
    </div>
  );
}

/** R88: owner sees the crew's visit notes on the job (read-only). */
export function OwnerVisitNotes({ docId }: { docId: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof jobVisitNotes>>>([]);
  useEffect(() => { let live = true; if (/^[0-9a-f-]{36}$/i.test(docId)) jobVisitNotes(docId).then((list) => live && setRows(list)).catch(() => {}); return () => { live = false; }; }, [docId]);
  if (!rows.length) return null;
  return (
    <div className="print-hide space-y-1 rounded-xl border border-slate-200 p-3 text-sm" data-testid="owner-visit-notes">
      <p className="font-semibold">Crew visit notes</p>
      {rows.map((row) => <p key={row.worker_email} data-testid="owner-visit-note"><span className="font-medium">{row.worker_name || "Crew"}:</span> {row.note}</p>)}
    </div>
  );
}
