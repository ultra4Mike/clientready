"use client";
import { useState } from "react";
import { PRESETS, PRESET_LABEL, presetOf, type CalendarFilter, type Preset } from "@/lib/calendar-filter";

/** R127: show / hide jobs by approval. Presets plus simple toggles; the caller saves the choice. */
export default function CalendarFilterBar({ filter, onChange }: { filter: CalendarFilter; onChange: (next: CalendarFilter) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="calendar-filter" data-preset={presetOf(filter) || "custom"}>
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Show</span>
      {(["approved", "drafts", "proposals", "all"] as Preset[]).map((key) => (
        <button key={key} type="button" data-testid={`filter-preset-${key}`} aria-pressed={presetOf(filter) === key} onClick={() => onChange({ ...PRESETS[key] })} className={`cr-btn min-h-11 ${presetOf(filter) === key ? "cr-btn-primary" : "cr-btn-secondary"}`}>{PRESET_LABEL[key]}</button>
      ))}
      <button type="button" data-testid="filter-more" aria-expanded={open} onClick={() => setOpen(!open)} className="cr-btn cr-btn-text min-h-11">{open ? "Fewer options" : "More options"}</button>
      {open && (
        <div className="flex basis-full flex-wrap gap-x-4 gap-y-1" data-testid="filter-toggles">
          {([["approved", "Approved work"], ["pending", "Sent, not approved"], ["drafts", "Drafts"], ["invoices", "Invoices"], ["proposals", "Proposals"]] as [keyof CalendarFilter, string][]).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-2"><input type="checkbox" data-testid={`filter-${key}`} checked={filter[key]} onChange={(event) => onChange({ ...filter, [key]: event.target.checked })} className="h-5 w-5" />{label}</label>
          ))}
        </div>
      )}
    </div>
  );
}
