"use client";
/** Account-wide time audit log (Team > Timesheet rules): who changed what, old → new, when; filter chips; CSV export. */
import { TIMESHEET_CHANGED_EVENT } from "@/lib/timesheet-sync";
import { useEffect, useState } from "react";
import { actorLabel, auditCsv, AUDIT_SAVED_EVENT, loadAudit, pendingAuditCount, type AuditRow } from "@/lib/day-events";
import { readWorkers } from "@/lib/schedule";
import { auditText } from "@/components/timesheet/DayDetail";

export const AUDIT_GROUPS: Record<string, { label: string; actions: string[] }> = {
  all: { label: "All", actions: [] },
  taps: { label: "Taps", actions: ["tap", "tap_edit", "tap_delete"] },
  edits: { label: "Edits", actions: ["edit", "edit_approve"] },
  approvals: { label: "Approvals", actions: ["approve", "unapprove", "edit_approve", "attest"] },
  fixes: { label: "Fixes", actions: ["fix_request", "fix_approved", "fix_denied"] },
  settings: { label: "Rules", actions: ["settings", "worker_rules"] },
};

export default function TimeAuditLog() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [group, setGroup] = useState("all");
  const [worker, setWorker] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(0);
  const [who, setWho] = useState<(a: string) => string>(() => (a: string) => actorLabel(a));
  useEffect(() => {
    let live = true; let seq = 0;
    // Reload on every change (each rule save, tap, edit), not just the first; newest request wins.
    const on = () => { const n = ++seq; void loadAudit({ limit: 1000 }).then((r) => { if (live && n === seq) { setRows(r); setPending(pendingAuditCount()); } }); };
    const ws = readWorkers();
    queueMicrotask(() => { if (live) setNames(Object.fromEntries(ws.map((w) => [w.id, w.name]))); });
    // Owner = the signed-in account; name from the saved profile (cloud row, then this device's copy).
    void (async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const user = data.session?.user;
      let name = "";
      if (user) { const { data: row } = await supabase.from("profiles").select("owner_name").eq("id", user.id).maybeSingle().then((x) => x, () => ({ data: null })); name = String((row as { owner_name?: string } | null)?.owner_name || ""); }
      if (!name) { try { name = String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").ownerName || ""); } catch { /* none */ } }
      if (live) setWho(() => (a: string) => actorLabel(a, ws, { name, email: user?.email || "" }));
    })();
    on();
    window.addEventListener(TIMESHEET_CHANGED_EVENT, on);
    window.addEventListener(AUDIT_SAVED_EVENT, on);
    return () => { live = false; window.removeEventListener(TIMESHEET_CHANGED_EVENT, on); window.removeEventListener(AUDIT_SAVED_EVENT, on); };
  }, []);
  const g = AUDIT_GROUPS[group];
  const shown = (rows || []).filter((r) => (!g.actions.length || g.actions.includes(r.action)) && (!worker || r.employeeId === worker));
  function exportCsv() {
    const named = shown.map((r) => ({ ...r, actor: who(r.actor), employeeId: names[r.employeeId] ? `${names[r.employeeId]} (${r.employeeId})` : r.employeeId }));
    const url = URL.createObjectURL(new Blob([auditCsv(named)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `time-change-history-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="cr-section mt-3 rounded-lg border p-3" data-testid="ts-audit" aria-labelledby="ts-h-audit">
      <h3 id="ts-h-audit" className="cr-section-label font-semibold">Change history</h3>
      <p className="text-xs text-[var(--cr-muted)]">Every tap, edit, approval, fix and rule change, kept at least 3 years.</p>
      {pending > 0 && <p className="cr-tone-warn mt-1 text-xs" data-testid="ts-audit-pending">{pending} change{pending === 1 ? "" : "s"} not saved to the cloud yet. They retry on the next change.</p>}
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
                {" · "}<b data-testid="ts-audit-actor">{who(r.actor)}</b>{r.employeeId ? ` · ${names[r.employeeId] || "Worker"}` : ""}{r.date ? ` · ${r.date}` : ""} · {auditText(r)}
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-[var(--cr-muted)]" data-testid="ts-audit-empty">No changes {group === "all" && !worker ? "recorded yet" : "match this filter"}.</p>}
    </section>
  );
}
