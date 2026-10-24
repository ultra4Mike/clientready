"use client";
/** Calendar/Today checklist badge: tap or hover shows which items are done/missing; links to the document's checklist. */
import { useEffect, useId, useRef, useState } from "react";
import { checklistHref, checklistMissing, type ChecklistItem } from "@/lib/checklist";

export default function ChecklistBadge({ items, docId }: { items: ChecklistItem[]; docId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popId = useId();
  const done = items.filter((item) => item.done).length;
  const complete = done === items.length;
  const missing = checklistMissing(items);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative w-fit" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-controls={popId} onClick={() => setOpen((v) => !v)} title={missing.length ? `Missing: ${missing.map((i) => i.text).join(", ")}` : "Checklist complete"}
        className={`inline-flex min-h-8 w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${complete ? "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800" : "cr-tone-warn border-amber-300 bg-amber-50 text-amber-900"}`} data-testid="today-checklist">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
        Checklist {done}/{items.length}{!complete && <span className="font-normal"> · {missing.length} left</span>}
      </button>
      {open && (
        <div id={popId} role="dialog" aria-label="Checklist items" data-testid="checklist-popover" className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] rounded-xl border border-teal-500/30 bg-[var(--cr-card)] p-3 text-sm shadow-lg">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">{complete ? "All done" : `Still needed (${missing.length})`}</p>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} data-testid="checklist-pop-item" data-done={item.done ? "1" : "0"} className={`flex gap-2 ${item.done ? "text-[var(--cr-muted)] line-through" : "font-medium"}`}>
                <span aria-hidden="true" className={item.done ? "text-emerald-500" : "text-amber-500"}>{item.done ? "✓" : "○"}</span><span className="min-w-0 break-words">{item.text}</span>
              </li>
            ))}
          </ul>
          <a href={checklistHref(docId)} data-testid="checklist-open" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-teal-600 underline dark:text-teal-300">Open checklist ›</a>
        </div>
      )}
    </div>
  );
}
