"use client";

import { useEffect, useState } from "react";
import { applyReconcile, planReconcile, type ReconcileChange } from "@/lib/reconcile-schedule";

/** Team page: check that crew work dates/times match each job's schedule; review, then fix. */
export default function ScheduleReconcile() {
  const [changes, setChanges] = useState<ReconcileChange[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // The page can re-mount while jobs save; keep the result visible.
  useEffect(() => {
    const show = () => { const last = window.sessionStorage.getItem("cr-reconcile-msg"); if (last) { setMessage(last); check(); } };
    show();
    window.addEventListener("cr-reconcile", show);
    return () => window.removeEventListener("cr-reconcile", show);
  }, []);
  function check() {
    let docs = [];
    try { docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"); } catch { docs = []; }
    setChanges(planReconcile(docs));
  }
  async function apply() {
    if (!changes?.length) return;
    setBusy(true);
    const n = await applyReconcile(changes).catch(() => -1);
    setBusy(false);
    const text = n < 0 ? "Could not update every job. Try again." : `Updated ${n} job${n === 1 ? "" : "s"}. Crew rows, /crew and the calendar now match the schedule.`;
    window.sessionStorage.setItem("cr-reconcile-msg", text);
    window.dispatchEvent(new Event("cr-reconcile"));
    setMessage(text);
    check();
  }
  return (
    <section className="mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm" data-testid="reconcile">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Crew dates check</h2>
      <p className="mt-1 text-[var(--cr-muted)]">Makes each crew member&apos;s work date and start time match the job&apos;s schedule. Nothing changes until you review the list and tap Fix. Invoice dates and pay stay as they are.</p>
      <button type="button" data-testid="reconcile-check" onClick={() => { window.sessionStorage.removeItem("cr-reconcile-msg"); setMessage(""); check(); }} className="mt-2 min-h-11 rounded-lg border border-teal-500/40 px-4">Check</button>
      {changes && changes.length === 0 && <p className="mt-2" data-testid="reconcile-none">Everything matches.</p>}
      {changes && changes.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-teal-500/10" data-testid="reconcile-preview" data-count={changes.length}>
            {changes.map((c, i) => (
              <li key={`${c.docId}-${i}`} className="py-2" data-testid="reconcile-change" data-doc={c.docId}>
                <span className="font-medium">{c.number}</span>{c.client ? ` · ${c.client}` : ""} · {c.what}: <span className="line-through opacity-70">{c.from}</span> → <span className="font-medium">{c.to}</span>
              </li>
            ))}
          </ul>
          <button type="button" data-testid="reconcile-apply" disabled={busy} onClick={() => void apply()} className="mt-2 min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white">{busy ? "Fixing…" : `Fix ${changes.length} item${changes.length === 1 ? "" : "s"}`}</button>
        </>
      )}
      {message && <p className="mt-2" role="status" data-testid="reconcile-message">{message}</p>}
    </section>
  );
}
