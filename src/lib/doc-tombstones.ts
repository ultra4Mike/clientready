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

export function localTombstones() {
  return readMap(TOMBSTONES_KEY);
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
    const { error: markError } = await supabase.from("document_tombstones").upsert({ owner_id: userId, doc_id: id, deleted_at: at });
    if (markError) continue;
    const { error } = await supabase.from("documents").delete().eq("id", id).eq("user_id", userId);
    if (error) continue;
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
  const { data, error } = await supabase.from("document_tombstones").select("doc_id, deleted_at").eq("owner_id", userId);
  const local = localTombstones();
  if (!error && data?.length) {
    const next = { ...local };
    for (const row of data as { doc_id: string; deleted_at: string }[]) next[row.doc_id] ||= row.deleted_at || new Date().toISOString();
    if (Object.keys(next).length !== Object.keys(local).length) writeMap(TOMBSTONES_KEY, next);
    return new Set(Object.keys(next));
  }
  return new Set(Object.keys(local));
}
