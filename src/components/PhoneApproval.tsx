"use client";
import { useRef, useState } from "react";
import { approvalLine, historyTime, canOwnerMarkApproved, ownerMarkApproved, cleanApprovalNote, APPROVAL_NOTE_MAX, type Approval } from "@/lib/approval";

/**
 * Owner-only "Approved by phone" control (calendar job popover + document page). Drafts must be sent first, so a
 * draft gets "Send for approval" (opens the normal email composer, which confirms before sending; nothing auto-sends).
 * Approve and Undo each append an entry to the document history.
 */
export default function PhoneApproval({ docId, status, approval, ownerName, onChange, onSend, compact }: {
  docId: string; status: string; approval: Approval | null; ownerName: string;
  onChange: (approval: Approval | null) => void; onSend: () => void; compact?: boolean;
}) {
  const [asking, setAsking] = useState<"" | "approve" | "undo">("");
  const [note, setNoteState] = useState("");
  // The latest typed text, read at confirm time so a re-render mid-typing can never save a partial note.
  const noteRef = useRef("");
  const setNote = (value: string) => { noteRef.current = value; setNoteState(value); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const btn = "min-h-11 rounded-lg px-4 text-sm font-semibold transition";
  const run = async (undo: boolean) => {
    setBusy(true); setError("");
    const r = await ownerMarkApproved(docId, ownerName, { method: "phone", note: cleanApprovalNote(noteRef.current || note), undo });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setAsking(""); setNote(""); onChange(r.approval);
  };
  const approved = approval?.status === "approved";
  return (
    <div className={compact ? "space-y-2" : "space-y-2"} data-testid="phone-approval" data-state={approved ? "approved" : status === "draft" ? "draft" : "waiting"}>
      {approved ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="cr-tone-good rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800" data-testid="approval-line">{approvalLine(approval)}</p>
          <button type="button" data-testid="undo-approval" onClick={() => setAsking("undo")} className={`${btn} border border-slate-300 hover:border-red-400`}>Undo approval</button>
        </div>
      ) : status === "draft" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="send-for-approval" onClick={onSend} className={`${btn} bg-teal-500 text-slate-950! hover:bg-teal-400`}>Send for approval</button>
          <p className="text-xs text-[var(--cr-muted)]" data-testid="draft-explain">This is a draft. Send it to the client first; you can mark it approved by phone after it is sent.</p>
        </div>
      ) : canOwnerMarkApproved(status, approval) ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="approved-by-phone" onClick={() => setAsking("approve")} className={`${btn} border border-teal-500/60 hover:bg-teal-500/10`}>Approved by phone</button>
          <button type="button" data-testid="resend-remind" onClick={onSend} className={`${btn} border border-slate-300 hover:border-teal-500`}>Resend / remind client</button>
        </div>
      ) : null}
      {asking && (
        <div role="dialog" aria-modal="true" aria-label={asking === "undo" ? "Undo approval" : "Approved by phone"} data-testid="phone-approval-dialog" className="rounded-xl border border-teal-500/40 bg-[var(--cr-card)] p-3 shadow-lg">
          <p className="text-sm font-semibold">{asking === "undo" ? "Undo this approval? It goes back to waiting for the client." : "Record that the client approved by phone?"}</p>
          <label className="mt-2 flex flex-col gap-1 text-sm">Note (optional)
            <textarea data-testid="phone-approval-note" value={note} maxLength={APPROVAL_NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder={asking === "undo" ? "Why (optional)" : "e.g. John on phone"} className="min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2" />
          </label>
          <p className="mt-1 text-xs text-[var(--cr-muted)]">Your name and the time are added to the document history. History entries can&apos;t be edited.</p>
          {error && <p className="mt-1 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} data-testid="phone-approval-confirm" onClick={() => run(asking === "undo")} className={`${btn} bg-teal-500 text-slate-950! hover:bg-teal-400 disabled:opacity-50`}>{busy ? "Saving…" : asking === "undo" ? "Undo approval" : "Confirm approved"}</button>
            <button type="button" onClick={() => { setAsking(""); setError(""); setNote(""); }} className={`${btn} border border-slate-300`}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only, append-only history list for the document page. */
export function DocHistory({ entries }: { entries: { at: string; by: string; action: string; note?: string }[] }) {
  if (!entries.length) return null;
  return (
    <ol className="space-y-1 text-sm" data-testid="doc-history">
      {[...entries].reverse().map((e, i) => <li key={`${e.at}-${i}`}><span className="font-medium">{e.action}</span> · {historyTime(e.at)} · by {e.by}{e.note ? ` · “${e.note}”` : ""}</li>)}
    </ol>
  );
}
