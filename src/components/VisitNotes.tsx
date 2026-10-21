"use client";

import { useState } from "react";

/**
 * Backlog 9: multi-visit job notes. One dated note per visit on the same job (owner only, never on the
 * customer copy). Newest first. Saved with the document.
 */
export type VisitNote = { id: string; date: string; text: string };

export function readVisitNotes(value: unknown): VisitNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is Record<string, unknown> => Boolean(n) && typeof n === "object")
    .map((n) => ({ id: String(n.id || ""), date: String(n.date || "").slice(0, 10), text: String(n.text || "").slice(0, 2000) }))
    .filter((n) => n.id && n.text.trim());
}

export default function VisitNotes({ notes, onChange, today, disabled = false }: { notes: VisitNote[]; onChange: (notes: VisitNote[]) => void; today: string; disabled?: boolean }) {
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const sorted = [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  function add() {
    if (!text.trim()) return;
    onChange([...notes, { id: `${Date.now()}`, date: date || today, text: text.trim() }]);
    setText("");
  }
  return (
    <div className="print-hide space-y-2 rounded-xl border border-slate-200 p-3 text-sm" data-testid="visit-notes" data-count={notes.length}>
      <p className="font-semibold">Visit notes <span className="font-normal text-xs text-slate-500">(only you see these)</span></p>
      {!disabled && (
        <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <input type="date" aria-label="Visit date" data-testid="visit-note-date" className="min-h-11 rounded-lg border border-slate-300 px-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          <input aria-label="What happened on this visit" data-testid="visit-note-text" className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" placeholder="e.g. Framing done, drywall next Tue" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" data-testid="visit-note-add" disabled={!text.trim()} onClick={add} className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white disabled:opacity-50">Add</button>
        </div>
      )}
      {sorted.length === 0 && <p className="text-xs text-slate-500">One line per visit keeps a multi-day job easy to follow. Save the document to keep them.</p>}
      <ul className="divide-y divide-slate-100">
        {sorted.map((note) => (
          <li key={note.id} className="flex items-start gap-3 py-1.5" data-testid="visit-note">
            <span className="w-24 shrink-0 tabular-nums text-xs text-slate-500">{note.date}</span>
            <span className="min-w-0 flex-1 break-words">{note.text}</span>
            {!disabled && <button type="button" aria-label="Remove note" className="tap min-h-11 min-w-11 text-slate-400 hover:text-rose-600" onClick={() => onChange(notes.filter((n) => n.id !== note.id))}>×</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
