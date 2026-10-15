"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { currentSyncState, isSyncing, onSyncChange, pendingIds, setSyncing, type SyncState } from "@/lib/sync-status";

/** Uploads documents saved while offline. Uses the normal merge (by id/updatedAt); never deletes. */
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

  useEffect(() => {
    let alive = true;
    const update = () => alive && setState(currentSyncState());
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSignedIn(Boolean(data.session));
      update();
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
    <button
      type="button"
      data-testid="sync-pill"
      data-state={state}
      onClick={() => flushPending()}
      title={state === "local" ? "Tap to try syncing now" : undefined}
      aria-label={LABELS[state]}
      className={`print-hide inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 max-[899px]:h-11 max-[899px]:w-11 max-[899px]:justify-center max-[899px]:border-0 max-[899px]:bg-transparent max-[899px]:p-0 text-xs font-medium ${STYLES[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full max-[899px]:h-2.5 max-[899px]:w-2.5 ${state === "synced" ? "bg-teal-500" : state === "syncing" ? "animate-pulse bg-teal-500" : "bg-amber-500"}`} />
      <span className="max-[899px]:sr-only">
        {LABELS[state]}
        {(state === "local" || state === "offline") && count > 0 ? ` (${count})` : ""}
      </span>
    </button>
  );
}
