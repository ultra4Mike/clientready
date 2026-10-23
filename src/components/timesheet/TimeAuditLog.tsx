"use client";
/** Account-wide time audit log (Team > Timesheet rules): who changed what, old → new, when; filter chips; CSV export. */
import { TIMESHEET_CHANGED_EVENT } from "@/lib/timesheet-sync";
import { useEffect, useState } from "react";
import { auditCsv, loadAudit, type AuditRow } from "@/lib/day-events";
import { readWorkers } from "@/lib/schedule";
import { auditText } from "@/components/timesheet/DayDetail";

export const AUDIT_GROUPS: Record<string, { label: string; actions: string[] }> = {
  all: { label: "All", actions: [] },
  taps: { label: "Taps", actions: ["tap", "tap_edit", "tap_delete"] },
  edits: { label: "Edits", actions: ["edit", "edit_approve"] },
  approvals: { label: "Approvals", actions: ["approve", "unapprove", "edit_approve", "attest"] },
  fixes: { label: "Fixes", actions: ["fix_request", "fix_approved", "fix_denied"] },
  settings: { label: "Rules", actions: ["settings"] },
};

export default function TimeAuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [group, setGroup] = useState("all");
  const [worker, setWorker] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void loadAudit({ limit: 1000 }).then((r) => { if (live) { setRows(r); setNames(Object.fromEntries(readWorkers().map((w) => [w.id, w.name]))); } });
    const on = () => void loadAudit({ limit: 1000 }).then((r) => { if (live) setRows(r); });
    window.addEventListener(TIMESHEET_CHANGED_EVENT, on);
    return () => { live = false; window.removeEventListener(TIMESHEET_CHANGED_EVENT, on); };
  }, []);
  const g = AUDIT_GROUPS[group];
  const shown = (rows || []).filter((r) => (!g.actions.length || g.actions.includes(r.action)) && (!worker || r.employeeId === worker));
  function exportCsv() {
    const named = shown.map((r) => ({ ...r, employeeId: names[r.employeeId] ? `${names[r.employeeId]} (${r.employeeId})` : r.employeeId }));
    const url = URL.createObjectURL(new Blob([auditCsv(named)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `time-change-history-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="cr-section mt-3 rounded-lg border p-3" data-testid="ts-audit" aria-labelledby="ts-h-audit">
      <h3 id="ts-h-audit" className="cr-section-label font-semibold">Change history</h3>
      <p className="text-xs text-[var(--cr-muted)]">Every tap, edit, approval, fix and rule change, kept at least 3 years.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Filter changes">
        {Object.entries(AUDIT_GROUPS).map(([k, v]) => (
          <button key={k} type="button" className="cr-chip2 cr-btn-text min-h-9 rounded-full border px-3" data-testid={`ts-audit-chip-${k}`} data-state={group === k ? "on" : "off"} aria-pressed={group === k} onClick={() => setGroup(k)}>{v.label}</button>
        ))}
        <select aria-label="Worker" name="ts-audit-worker" data-testid="ts-audit-worker" className="min-h-9 rounded-lg border bg-transparent px-2" value={worker} onChange={(e) => setWorker(e.target.value)}>
          <option value="">Everyone</option>{Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <button type="button" className="cr-btn cr-btn-secondary" data-testid="ts-audit-export" disabled={!shown.length} onClick={exportCsv}>Export (CSV)</button>
      </div>
      {rows === null ? <p className="mt-2 text-[var(--cr-muted)]" data-testid="ts-audit-loading">Loading…</p>
        : shown.length ? (
          <ol className="mt-2 max-h-96 space-y-1 overflow-y-auto border-l-2 pl-3" data-testid="ts-audit-list">
            {shown.slice(0, 300).map((r, i) => (
              <li key={r.id || i} data-testid="ts-audit-row" data-action={r.action}>
                <span className="tabular-nums text-[var(--cr-muted)]">{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                {" · "}<b>{r.actor || "system"}</b>{r.employeeId ? ` · ${names[r.employeeId] || "Worker"}` : ""}{r.date ? ` · ${r.date}` : ""} · {auditText(r)}
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-[var(--cr-muted)]" data-testid="ts-audit-empty">No changes {group === "all" && !worker ? "recorded yet" : "match this filter"}.</p>}
    </section>
  );
}
