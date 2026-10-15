"use client";

import { useState } from "react";
import { approvalLabel, approvalUrl, setApproval as saveApproval, type Approval } from "@/lib/approval";

/** Small status badge for the owner: "Awaiting approval" or "Approved on <time>". */
export function ApprovalBadge({ approval, className = "" }: { approval: Approval | null; className?: string }) {
  if (!approval) return null;
  const approved = approval.status === "approved";
  return (
    <span
      data-testid="approval-badge"
      className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${approved ? "border-emerald-500 text-emerald-600" : "border-amber-500 text-amber-600 print-hide"} ${className}`}
    >
      {approvalLabel(approval)}
    </span>
  );
}

/** Owner controls: share, copy, regenerate or revoke the approval link. */
export function ApprovalShare({ docId, approval, onChange }: { docId: string; approval: Approval | null; onChange: (approval: Approval | null) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const link = approval?.token ? approvalUrl(approval.token) : "";

  async function run(mode: "create" | "revoke") {
    if (mode === "create" && approval && !window.confirm("Make a new link? The old link will stop working.")) return;
    if (mode === "revoke" && !window.confirm("Turn off this approval link? The customer will no longer be able to open it.")) return;
    setBusy(true);
    const result = await saveApproval(docId, mode);
    setBusy(false);
    if (result.error) return setMessage(result.error);
    onChange(result.approval);
    setMessage(mode === "create" ? "Approval link ready. Copy it and send it to your customer." : "Approval link turned off.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied");
    } catch {
      setMessage("Select the link and copy it.");
    }
  }

  return (
    <div className="print-hide space-y-2 rounded-lg border border-slate-300 p-3 text-sm" data-testid="approval-share">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">Client approval</p>
        <ApprovalBadge approval={approval} />
      </div>
      {link && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Approval link" readOnly value={link} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
          <button type="button" onClick={copy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Copy link</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!approval && <button type="button" disabled={busy} onClick={() => run("create")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Share approval link</button>}
        {approval && <button type="button" disabled={busy} onClick={() => run("create")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">New link</button>}
        {approval && <button type="button" disabled={busy} onClick={() => run("revoke")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Revoke link</button>}
      </div>
      {message && <p className="text-xs text-slate-500" data-testid="approval-message">{message}</p>}
    </div>
  );
}
