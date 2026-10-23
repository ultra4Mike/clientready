/**
 * Tracks documents saved on this device that have not reached the cloud yet (offline, network
 * error), and lets the app show a status pill. Documents are always saved locally first; this only
 * remembers which ids still need uploading. The upload itself uses the normal account sync
 * (merge by id/updatedAt, nothing is deleted).
 */
import { pendingDeleteIds } from "./doc-tombstones";

export type SyncState = "local" | "syncing" | "synced" | "offline";

const DIRTY_KEY = "clientready-unsynced-ids";
const EVENT = "clientready-sync";
let syncing = false;
// R100: "Synced" only after this page load fetched the account from the server once.
let fetchedOnce = false;
export function markFetched(ok: boolean) {
  if (ok) fetchedOnce = true;
  window.dispatchEvent(new Event(EVENT));
}
export const hasFetched = () => fetchedOnce;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(DIRTY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (ids.length) window.localStorage.setItem(DIRTY_KEY, JSON.stringify([...new Set(ids)]));
  else window.localStorage.removeItem(DIRTY_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** Unsynced saves plus queued deletes (both are sent by the next sync). */
export function pendingIds() {
  return typeof window === "undefined" ? [] : [...read(), ...pendingDeleteIds().map((id) => `delete:${id}`)];
}

export function markUnsynced(id: string) {
  write([...read(), id]);
}

/** A save reached the cloud: forget the old (local) id and the new one. */
export function markSynced(...ids: string[]) {
  write(read().filter((item) => !ids.includes(item)));
}

/** Ids still marked unsynced (not queued deletes). */
export function unsyncedIds() {
  return typeof window === "undefined" ? [] : read();
}

/**
 * After a successful fetch+sync: drop marks that can never upload. Kept: any local (non-cloud) id that
 * is still on this device, and anything that was just pushed (its own save clears it when it lands).
 */
export function clearSettledMarks(localIds: string[], cloudIds: string[], pushedIds: string[]) {
  const here = new Set(localIds), cloud = new Set(cloudIds), pushed = new Set(pushedIds);
  const stale = read().filter((id) => !pushed.has(id) && (!here.has(id) || cloud.has(id)));
  if (stale.length) markSynced(...stale);
  return stale;
}

export function clearPending() {
  write([]);
}

export function isSyncing() {
  return syncing;
}

export function setSyncing(value: boolean) {
  syncing = value;
  window.dispatchEvent(new Event(EVENT));
}

export function currentSyncState(): SyncState {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (syncing || !fetchedOnce) return "syncing";
  return pendingIds().length ? "local" : "synced";
}

export function onSyncChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
    window.removeEventListener("storage", listener);
  };
}
