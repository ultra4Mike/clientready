"use client";

/** "Restore unsaved changes?" — shown when a draft newer than the saved record was found. */
export default function RestoreDraftBanner({ draft, onRestore, onDiscard, what = "changes" }: { draft: { updatedAt: string } | null; onRestore: () => void; onDiscard: () => void; what?: string }) {
  if (!draft) return null;
  const when = new Date(draft.updatedAt);
  return (
    <div role="alert" data-testid="restore-draft" className="cr-tone-warn mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="min-w-0 flex-1 basis-48 font-medium">Restore unsaved {what}? <span className="font-normal">From {Number.isNaN(when.getTime()) ? "earlier" : when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span></p>
      <button type="button" data-testid="restore-draft-yes" onClick={onRestore} className="cr-btn cr-btn-primary">Restore</button>
      <button type="button" data-testid="restore-draft-discard" onClick={onDiscard} className="cr-btn cr-btn-text">Discard</button>
    </div>
  );
}

/** Small label: the typed work is on this device even before Save. */
export function DraftStatus({ status }: { status: string }) {
  return status ? <span data-testid="draft-status" className="text-xs text-[var(--cr-muted)]">Saved on this device</span> : null;
}
