"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { sweepEmptyLocalDocs } from "@/lib/empty-docs";
import { currentSyncState, hasFetched, isSyncing, onSyncChange, pendingIds, setSyncing, type SyncState } from "@/lib/sync-status";

/** Uploads documents saved while offline and sends queued deletes. Uses the normal merge (by id/updatedAt). */
export async function flushPending() {
  if (isSyncing() || navigator.onLine === false || !pendingIds().length) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const run = async () => {
    // Another tab may have uploaded everything while this one waited for the lock.
    if (!pendingIds().length) return;
    setSyncing(true);
    try {
      await loadAccountIntoCache();
    } finally {
      setSyncing(false);
    }
  };
  // One tab at a time, so a new document is never uploaded twice.
  if (navigator.locks) await navigator.locks.request("clientready-sync", run);
  else await run();
}

const LABELS: Record<SyncState, string> = {
  offline: "Offline · saved on this device",
  local: "Saved on this device",
  syncing: "Syncing…",
  synced: "Synced",
};

const STYLES: Record<SyncState, string> = {
  offline: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  local: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  syncing: "border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-300",
  synced: "border-teal-500/30 text-teal-600 dark:text-teal-300",
};

export default function SyncPill() {
  const [state, setState] = useState<SyncState | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const update = () => alive && setState(currentSyncState());
    // Help retest: stray empty "No client" jobs left by an abandoned new job (before 7fb0ad8+1) are removed.
    sweepEmptyLocalDocs();
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.session));
      update();
      // R100: "Synced" only after a server fetch on this page load.
      if (data.session && !hasFetched()) void loadAccountIntoCache().then(update);
      flushPending();
    });
    const stop = onSyncChange(update);
    const retry = () => flushPending();
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, 30000);
    return () => {
      alive = false;
      stop();
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, []);

  if (!signedIn || !state) return null;
  const count = pendingIds().length;
  return (
    <span className="relative inline-flex">
    <button
      type="button"
      data-testid="sync-pill"
      data-state={state}
      onClick={() => { setOpen((v) => !v); void flushPending(); }}
      aria-expanded={open}
      title={state === "local" ? "Tap to see what is waiting and try syncing now" : undefined}
      aria-label={LABELS[state]}
      className={`print-hide inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 max-[899px]:h-11 max-[899px]:w-11 max-[899px]:justify-center max-[899px]:border-0 max-[899px]:bg-transparent max-[899px]:p-0 text-xs font-medium ${STYLES[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full max-[899px]:h-2.5 max-[899px]:w-2.5 ${state === "synced" ? "bg-teal-500" : state === "syncing" ? "animate-pulse bg-teal-500" : "bg-amber-500"}`} />
      <span className="max-[899px]:sr-only">
        {LABELS[state]}
        {(state === "local" || state === "offline") && count > 0 ? ` (${count})` : ""}
      </span>
    </button>
    {open && (
      <span role="dialog" aria-label="Waiting to sync" data-testid="sync-pending-list" className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-300 bg-[var(--cr-bg,white)] p-3 text-left text-xs shadow-lg dark:border-slate-600">
        {count === 0 ? <span className="block">Nothing is waiting. Everything is in your account.</span> : (
          <>
            <span className="mb-1 block font-semibold">Waiting to reach your account ({count})</span>
            <ul className="space-y-1">{pendingItems().map((item) => <li key={item.key} data-testid="sync-pending-item" data-key={item.key}>{item.label}</li>)}</ul>
            <span className="mt-2 block text-[var(--cr-muted)]">These upload by themselves when the connection works.</span>
          </>
        )}
      </span>
    )}
    </span>
  );
}

/** What feeds the count, by number where known (unsynced saves + queued deletes). */
export function pendingItems() {
  let docs: { id?: string; type?: string; title?: string; data?: { invoiceNumber?: string } }[] = [];
  try { docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"); } catch { docs = []; }
  const name = (id: string) => { const d = docs.find((x) => String(x?.id) === id); return d ? String(d.data?.invoiceNumber || d.title || "Untitled document") : ""; };
  return pendingIds().map((key) => {
    if (key.startsWith("delete:")) { const id = key.slice(7); return { key, label: `Delete of ${name(id) || `a removed document (${id.slice(0, 8)})`}` }; }
    return { key, label: `${name(key) || `Document ${key.slice(0, 8)}`}: changes not uploaded yet` };
  });
}
