import { isUuid, saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";

export const OWNER_KEY = "clientready-cache-owner";
export const DOCS_KEY = "clientready-documents";
const unsyncedKey = (owner: string) => `clientready-unsynced-${owner}`;

type Doc = CloudDoc;
type AnyDoc = { id: string; data?: Record<string, unknown> };

function stampOf(doc: AnyDoc) {
  const value = Date.parse(String(doc.data?.updatedAt || ""));
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The approval block always comes from the cloud, even when the local copy is newer: the customer
 * approves in the cloud, and only the share/revoke actions (which write the cloud directly) change it.
 */
function withCloudApproval<T extends AnyDoc>(winner: T, cloud: T): T {
  const data = { ...(winner.data || {}) };
  if (cloud.data?.approval) data.approval = cloud.data.approval;
  else delete data.approval;
  return { ...winner, data };
}

/** The schedule block merges on its own updatedAt, so a crew status change isn't lost to a newer local edit elsewhere. */
function withNewerSchedule<T extends AnyDoc>(winner: T, local: T, cloud: T): T {
  const a = local.data?.schedule as { updatedAt?: string } | undefined;
  const b = cloud.data?.schedule as { updatedAt?: string } | undefined;
  if (!a && !b) return winner;
  const pick = !a ? b : !b ? a : Date.parse(b.updatedAt || "") > Date.parse(a.updatedAt || "") ? b : a;
  return { ...winner, data: { ...(winner.data || {}), schedule: pick } };
}

/**
 * Merges cloud and local copies by id.
 * - Only in local: kept (uploaded later by syncLocalDocs).
 * - Only in cloud: added.
 * - In both: the newer updatedAt wins. If neither (or both equally) is stamped, cloud wins, but any
 *   data keys the cloud copy lacks (e.g. changeOrderNotes, payments) are filled from local so nothing is lost.
 * Returns the merged list plus local docs that are newer than cloud and should be pushed up.
 */
export function mergeDocs<T extends AnyDoc>(local: T[], cloud: T[]) {
  const cloudById = new Map(cloud.map((doc) => [doc.id, doc]));
  const localById = new Map<string, T>();
  for (const doc of local) localById.set(doc.id, doc);
  const merged: T[] = [];
  const pushUp: T[] = [];
  for (const doc of cloud) {
    const mine = localById.get(doc.id);
    if (!mine) {
      merged.push(doc);
      continue;
    }
    const localTime = stampOf(mine);
    const cloudTime = stampOf(doc);
    if (localTime > cloudTime) {
      const kept = withNewerSchedule(withCloudApproval(mine, doc), mine, doc);
      merged.push(kept);
      pushUp.push(kept);
    } else {
      merged.push(withNewerSchedule(withCloudApproval({ ...doc, data: { ...(mine.data || {}), ...(doc.data || {}) } }, doc), mine, doc));
    }
  }
  for (const doc of local) if (!cloudById.has(doc.id)) merged.push(doc);
  return { merged, pushUp };
}

/** Replaces references to a document id inside other documents (change-order links). */
function remapReferences(docs: Doc[], from: string, to: string) {
  const changed: Doc[] = [];
  const next = docs.map((doc) => {
    const data = doc.data || {};
    let touched = false;
    const copy: Record<string, unknown> = { ...data };
    const of = data.changeOrderOf as { id?: string } | undefined;
    if (of && of.id === from) {
      copy.changeOrderOf = { ...of, id: to };
      touched = true;
    }
    if (Array.isArray(data.changeOrderNotes) && data.changeOrderNotes.some((note: { id?: string }) => note?.id === from)) {
      copy.changeOrderNotes = data.changeOrderNotes.map((note: { id?: string }) => (note?.id === from ? { ...note, id: to } : note));
      touched = true;
    }
    if (!touched) return doc;
    const updated = { ...doc, data: copy };
    changed.push(updated);
    return updated;
  });
  return { next, changed };
}

/**
 * Uploads local-only docs (ids that never got a cloud id) and local docs newer than cloud,
 * through the normal saveCloudDocument path. New cloud ids replace the local ids, and links
 * to them in other documents are updated. Returns the updated list.
 */
export async function syncLocalDocs(docs: Doc[], pushUp: Doc[]) {
  let list = [...docs];
  const toResave = new Map<string, Doc>();
  for (const doc of list.filter((item) => !isUuid(item.id))) {
    const oldId = doc.id;
    const newId = await saveCloudDocument(doc);
    if (newId === oldId) continue; // still offline / signed out: keep it local for next time
    list = list.map((item) => (item.id === oldId ? { ...doc, id: newId } : item));
    const remapped = remapReferences(list, oldId, newId);
    list = remapped.next;
    remapped.changed.forEach((item) => toResave.set(item.id, item));
    if (window.localStorage.getItem("clientready-open-document") === oldId) window.localStorage.setItem("clientready-open-document", newId);
    rememberIdChange(oldId, newId);
  }
  for (const doc of pushUp) if (isUuid(doc.id)) toResave.set(doc.id, list.find((item) => item.id === doc.id) || doc);
  for (const doc of toResave.values()) {
    const current = list.find((item) => item.id === doc.id) || doc;
    if (isUuid(current.id)) await saveCloudDocument(current);
  }
  return list;
}

const REMAP_KEY = "clientready-id-remap";

/** A page that still holds a local id after a background upload can look up the cloud id. */
function rememberIdChange(oldId: string, newId: string) {
  try {
    const map = JSON.parse(window.localStorage.getItem(REMAP_KEY) || "{}") as Record<string, string>;
    map[oldId] = newId;
    window.localStorage.setItem(REMAP_KEY, JSON.stringify(map));
  } catch {
    window.localStorage.setItem(REMAP_KEY, JSON.stringify({ [oldId]: newId }));
  }
}

export function currentDocId(id: string) {
  if (!id || isUuid(id)) return id;
  try {
    const map = JSON.parse(window.localStorage.getItem(REMAP_KEY) || "{}") as Record<string, string>;
    return map[id] || id;
  } catch {
    return id;
  }
}

/** Before signing out: park this owner's never-uploaded docs so a later sign-in can restore them. */
export function parkUnsyncedDocs() {
  const owner = window.localStorage.getItem(OWNER_KEY);
  const raw = window.localStorage.getItem(DOCS_KEY);
  if (!owner || !raw) return;
  try {
    const unsynced = (JSON.parse(raw) as Doc[]).filter((doc) => !isUuid(doc.id));
    if (unsynced.length) window.localStorage.setItem(unsyncedKey(owner), JSON.stringify(unsynced));
  } catch {
    // ignore unreadable cache
  }
}

export function takeParkedDocs(owner: string): Doc[] {
  const raw = window.localStorage.getItem(unsyncedKey(owner));
  if (!raw) return [];
  window.localStorage.removeItem(unsyncedKey(owner));
  try {
    return JSON.parse(raw) as Doc[];
  } catch {
    return [];
  }
}

/** Parks another account's never-uploaded docs under that account (used when a different user signs in). */
export function parkDocsFor(owner: string, docs: Doc[]) {
  const unsynced = docs.filter((doc) => !isUuid(doc.id));
  if (unsynced.length) window.localStorage.setItem(unsyncedKey(owner), JSON.stringify(unsynced));
}
