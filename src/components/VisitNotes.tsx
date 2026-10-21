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
    <div className="cr-panel print-hide space-y-3 rounded-xl border border-slate-200 p-3 text-sm sm:p-4" data-testid="visit-notes" data-count={notes.length}>
      <p className="font-semibold">Visit notes <span className="font-normal text-xs text-slate-500">(only you see these)</span></p>
      {!disabled && (
        <div className="grid gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <input type="date" aria-label="Visit date" data-testid="visit-note-date" className="min-h-11 w-full rounded-lg border border-slate-300 bg-transparent px-3 text-sm tabular-nums outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={date} onChange={(e) => setDate(e.target.value)} />
          <input aria-label="What happened on this visit" data-testid="visit-note-text" className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-transparent px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="e.g. Framing done, drywall next Tue" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" data-testid="visit-note-add" disabled={!text.trim()} onClick={add} className="min-h-11 rounded-lg bg-teal-500 px-5 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50">Add</button>
        </div>
      )}
      {sorted.length === 0 && <p className="text-xs text-slate-500">One line per visit keeps a multi-day job easy to follow. Save the document to keep them.</p>}
      <ul className="ml-1.5 border-l-2 border-teal-500/30">
        {sorted.map((note) => (
          <li key={note.id} className="relative flex flex-col gap-0.5 py-2 pl-4 pr-11 before:absolute before:-left-[5px] before:top-3.5 before:h-2 before:w-2 before:rounded-full before:bg-teal-500 sm:flex-row sm:items-start sm:gap-3" data-testid="visit-note">
            <span className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-[var(--cr-muted)] sm:w-24">{note.date}</span>
            <span className="min-w-0 flex-1 break-words leading-relaxed">{note.text}</span>
            {!disabled && <button type="button" aria-label="Remove note" className="tap absolute right-0 top-0 min-h-11 min-w-11 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600" onClick={() => onChange(notes.filter((n) => n.id !== note.id))}>×</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
