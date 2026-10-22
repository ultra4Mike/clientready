"use client";

/** "Restore unsaved changes?" — a draft newer than the saved record was found. Also the sync label + conflict choice. */
export default function RestoreDraftBanner({ draft, onRestore, onDiscard, what = "changes", status = "", conflict = false, onResolve }: { draft: { updatedAt: string } | null; onRestore: () => void; onDiscard: () => void; what?: string; status?: string; conflict?: boolean; onResolve?: (choice: "mine" | "theirs") => void }) {
  const when = draft ? new Date(draft.updatedAt) : null;
  return (
    <>
      {draft && (
        <div role="alert" data-testid="restore-draft" className="cr-tone-warn mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="min-w-0 flex-1 basis-48 font-medium">Restore unsaved {what}? <span className="font-normal">From {when && !Number.isNaN(when.getTime()) ? when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "earlier"}.</span></p>
          <button type="button" data-testid="restore-draft-yes" onClick={onRestore} className="cr-btn cr-btn-primary">Restore</button>
          <button type="button" data-testid="restore-draft-discard" onClick={onDiscard} className="cr-btn cr-btn-text">Discard</button>
        </div>
      )}
      {conflict && onResolve && (
        <div role="alert" data-testid="draft-conflict" className="cr-tone-warn mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="min-w-0 flex-1 basis-48 font-medium">Newer unsaved {what} came from another device.</p>
          <button type="button" data-testid="draft-conflict-mine" onClick={() => onResolve("mine")} className="cr-btn cr-btn-primary">Keep mine</button>
          <button type="button" data-testid="draft-conflict-theirs" onClick={() => onResolve("theirs")} className="cr-btn cr-btn-secondary">Use theirs</button>
        </div>
      )}
      {status && !draft && <p data-testid="draft-status" data-status={status} className="mb-2 text-xs text-[var(--cr-muted)]">{status === "synced" ? "Synced" : status === "offline-queued" ? "Offline – will sync" : status === "conflict" ? "Needs your choice" : "Saved on this device"}</p>}
    </>
  );
}
