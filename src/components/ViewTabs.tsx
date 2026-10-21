"use client";

import { CALENDAR_VIEWS, DOCUMENT_VIEWS, GRID_VIEWS } from "@/lib/view-routes";

const tabClass = (on: boolean) => `cr-btn flex-1 sm:flex-none ${on ? "cr-btn-primary" : "cr-btn-text"}`;

/** Redesign 3: Calendar views. Grid views switch in place (onPick); others open /calendar?view=… */
export function CalendarViewTabs({ current, onPick }: { current: string; onPick?: (view: "week" | "month" | "worker") => void }) {
  return (
    <div role="tablist" data-testid="calendar-views" className="flex w-full flex-wrap gap-1 rounded-xl border border-slate-500/30 bg-[var(--cr-card)] p-1 shadow-sm sm:w-auto">
      {CALENDAR_VIEWS.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={current === key} data-testid={`cal-view-${key}`} className={tabClass(current === key)}
          onClick={() => {
            if (onPick && GRID_VIEWS.includes(key) && GRID_VIEWS.includes(current)) { onPick(key as "week" | "month" | "worker"); window.history.replaceState(null, "", `/calendar?view=${key}`); }
            else window.location.href = `/calendar?view=${key}`;
          }}>{label}</button>
      ))}
    </div>
  );
}

/** Redesign 3: Documents filters that used to be their own menu items. */
export function DocumentsViewTabs({ current, onPick }: { current: string; onPick?: (view: "all" | "drafts") => void }) {
  return (
    <div role="tablist" data-testid="documents-views" className="mb-3 flex w-full flex-wrap gap-1 rounded-xl border border-slate-500/30 bg-[var(--cr-card)] p-1 shadow-sm sm:w-auto">
      {DOCUMENT_VIEWS.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={current === key} data-testid={`docs-view-${key}`} className={tabClass(current === key)}
          onClick={() => {
            if (onPick && (key === "all" || key === "drafts") && (current === "all" || current === "drafts")) { onPick(key); window.history.replaceState(null, "", key === "all" ? "/documents" : "/documents?view=drafts"); }
            else window.location.href = key === "all" ? "/documents" : `/documents?view=${key}`;
          }}>{label}</button>
      ))}
    </div>
  );
}
