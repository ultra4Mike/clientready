import { supabase } from "@/lib/supabase";

/**
 * Document deletes that survive offline use and other devices:
 * - Local tombstones (id -> deletedAt) hide a deleted document from every merge on this device.
 * - Pending deletes are queued while offline and sent on the next sync.
 * - Cloud tombstones (table document_tombstones) tell other devices the document was deleted, so
 *   their merge drops their local copy instead of keeping or re-uploading it.
 */
const TOMBSTONES_KEY = "clientready-deleted-docs";
const PENDING_KEY = "clientready-pending-deletes";
const EVENT = "clientready-sync";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readMap(key: string): Record<string, string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeMap(key: string, map: Record<string, string>) {
  if (Object.keys(map).length) window.localStorage.setItem(key, JSON.stringify(map));
  else window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Before migration 20261015100000 runs the table doesn't exist: every read logs a failed request in
 * the browser console. Remember that for a few hours (per device) instead of asking on every page.
 */
const MISSING_KEY = "clientready-no-tombstone-table";
const tableMissing = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /document_tombstones/.test(error.message || "")));
function knownMissing() {
  const until = Number(window.localStorage.getItem(MISSING_KEY) || 0);
  return until > Date.now();
}
function noteMissing(error: { code?: string; message?: string } | null) {
  if (tableMissing(error)) window.localStorage.setItem(MISSING_KEY, String(Date.now() + 6 * 60 * 60 * 1000));
}

export function localTombstones() {
  return readMap(TOMBSTONES_KEY);
}

/** Drops queued deletes (used by the sync pill cleanup when the cloud no longer has the row). */
export function dropPendingDeletes(ids: string[]) {
  const next = readMap(PENDING_KEY);
  let changed = false;
  for (const id of ids) if (id in next) { delete next[id]; changed = true; }
  if (changed) writeMap(PENDING_KEY, next);
}

export function pendingDeleteIds() {
  return typeof window === "undefined" ? [] : Object.keys(readMap(PENDING_KEY));
}

/** Records the delete on this device (always) and queues the cloud delete for uploaded documents. */
export function recordDelete(id: string) {
  const at = new Date().toISOString();
  writeMap(TOMBSTONES_KEY, { ...localTombstones(), [id]: at });
  if (uuid.test(id)) writeMap(PENDING_KEY, { ...readMap(PENDING_KEY), [id]: at });
}

/** Sends queued deletes: tombstone first, then the row. Anything that fails stays queued. */
export async function flushDeletes(userId: string) {
  const pending = readMap(PENDING_KEY);
  for (const [id, at] of Object.entries(pending)) {
    if (!knownMissing()) {
      const { error: markError } = await supabase.from("document_tombstones").upsert({ owner_id: userId, doc_id: id, deleted_at: at });
      noteMissing(markError);
      // No table yet: still delete the row (other devices just can't be told until the migration runs).
      if (markError && !tableMissing(markError)) continue;
    }
    const { error } = await supabase.from("documents").delete().eq("id", id).eq("user_id", userId);
    if (error) {
      // Help retest: a queued delete for a row the cloud no longer has is done, not "waiting" forever.
      const { data: still, error: readError } = await supabase.from("documents").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
      if (readError || still) continue;
    }
    const next = readMap(PENDING_KEY);
    delete next[id];
    writeMap(PENDING_KEY, next);
  }
}

/**
 * Every deleted id this device knows about. Cloud tombstones (deletes from other devices) are copied
 * into the local list so every merge drops them. If the table can't be read, local tombstones still apply.
 */
export async function allTombstones(userId: string): Promise<Set<string>> {
  const local = localTombstones();
  if (knownMissing()) return new Set(Object.keys(local));
  const { data, error } = await supabase.from("document_tombstones").select("doc_id, deleted_at").eq("owner_id", userId);
  noteMissing(error);
  if (!error && data?.length) {
    const next = { ...local };
    for (const row of data as { doc_id: string; deleted_at: string }[]) next[row.doc_id] ||= row.deleted_at || new Date().toISOString();
    if (Object.keys(next).length !== Object.keys(local).length) writeMap(TOMBSTONES_KEY, next);
    return new Set(Object.keys(next));
  }
  return new Set(Object.keys(local));
}
