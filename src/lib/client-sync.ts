import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/cloud-docs";
import { clientKey } from "@/lib/portal";

const CLIENTS_KEY = "clientready-clients";
const FIELDS = ["company", "email", "phone", "address"] as const;
type Contact = { name: string; company: string; email: string; phone: string; address: string };
type SavedClient = Contact & { id: string } & Record<string, unknown>;

/**
 * After an invoice/proposal is saved: copy its contact details (company, email, phone, address) onto
 * the saved client it belongs to, matched by clientId, else by a unique name match. Only an
 * existing client is updated (none is created), blank fields are skipped; the name is not changed here (renames happen on the
 * Clients page). Other documents keep their own stored contact details.
 * Returns the updated client list, or null when nothing changed.
 */
export async function syncClientContact(clientId: string, contact: Contact): Promise<SavedClient[] | null> {
  let clients: SavedClient[] = [];
  try {
    clients = JSON.parse(window.localStorage.getItem(CLIENTS_KEY) || "[]");
  } catch {
    return null;
  }
  const byName = clients.filter((client) => clientKey(String(client.name || "")) === clientKey(contact.name));
  const target = (clientId && clients.find((client) => client.id === clientId)) || (byName.length === 1 ? byName[0] : undefined);
  if (!target) return null;
  const patch: Partial<Contact> = {};
  for (const field of FIELDS) {
    const value = contact[field].trim();
    // A blank field on the document never wipes what the client record has.
    if (value && value !== String(target[field] || "")) patch[field] = value;
  }
  if (!Object.keys(patch).length) return null;
  const next = clients.map((client) => (client.id === target.id ? { ...client, ...patch } : client));
  window.localStorage.setItem(CLIENTS_KEY, JSON.stringify(next));
  const userId = await getUserId().catch(() => "");
  if (userId) {
    // Baseline = the cloud row's updated_at as last loaded (present once migration 20261016000000 runs).
    const baseline = typeof target.updated_at === "string" && target.updated_at ? target.updated_at : null;
    queueContactPatch(userId, target.id, patch, baseline);
    await flushClientContactQueue();
  }
  return next;
}

const QUEUE_PREFIX = "clientready-client-sync-queue:";
/** baseline: cloud updated_at the change was based on (null = unknown); version: changes on every edit. */
type Queued = { patch: Partial<Contact>; queuedAt: string; baseline?: string | null; version?: string };
type Queue = Record<string, Queued>;
const queueKey = (userId: string) => `${QUEUE_PREFIX}${userId}`;

function readQueue(userId: string): Queue {
  try {
    return JSON.parse(window.localStorage.getItem(queueKey(userId)) || "{}") || {};
  } catch {
    return {};
  }
}

function writeQueue(userId: string, queue: Queue) {
  if (Object.keys(queue).length) window.localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  else window.localStorage.removeItem(queueKey(userId));
}

const newVersion = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function queueContactPatch(userId: string, id: string, patch: Partial<Contact>, baseline: string | null) {
  const queue = readQueue(userId);
  const prior = queue[id];
  queue[id] = {
    patch: { ...(prior?.patch || {}), ...patch },
    queuedAt: new Date().toISOString(),
    // Keep the original baseline while an earlier change is still unsent (the cloud hasn't moved for us).
    baseline: prior ? (prior.baseline ?? null) : baseline,
    version: newVersion(),
  };
  writeQueue(userId, queue);
}

/** Store the cloud's new updated_at on the cached client so the next queued change has the right baseline. */
function rememberUpdatedAt(id: string, updatedAt: string) {
  try {
    const clients = JSON.parse(window.localStorage.getItem(CLIENTS_KEY) || "[]") as SavedClient[];
    window.localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients.map((client) => (client.id === id ? { ...client, updated_at: updatedAt } : client))));
  } catch {
    // cache unreadable: next change simply has no baseline (falls back to the time check)
  }
}

type Outcome = { result: "sent" | "superseded" | "keep"; updatedAt?: string };

async function sendOne(userId: string, id: string, item: Queued): Promise<Outcome> {
  if (item.baseline) {
    // Conditional update: only applies if the cloud row is still exactly the version we edited.
    const { data, error } = await supabase.from("clients").update(item.patch).eq("id", id).eq("user_id", userId).eq("updated_at", item.baseline).select("id, updated_at");
    if (error) return { result: "keep" };
    const rows = Array.isArray(data) ? (data as { updated_at?: string }[]) : [];
    if (!rows.length) {
      console.info(`[client-sync] queued contact change for client ${id} dropped: superseded by a newer cloud edit (or client removed).`);
      return { result: "superseded" };
    }
    if (rows[0].updated_at) rememberUpdatedAt(id, rows[0].updated_at);
    return { result: "sent", updatedAt: rows[0].updated_at };
  }
  // Baseline unknown (column missing or not loaded yet): earlier behavior, time comparison on updated_at if present.
  const { data: row, error: readError } = await supabase.from("clients").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (readError) return { result: "keep" };
  if (!row) return { result: "superseded" };
  const cloudUpdated = typeof (row as Record<string, unknown>).updated_at === "string" ? String((row as Record<string, unknown>).updated_at) : "";
  if (cloudUpdated && new Date(cloudUpdated).getTime() > new Date(item.queuedAt).getTime()) {
    console.info(`[client-sync] queued contact change for client ${id} dropped: cloud row is newer.`);
    return { result: "superseded" };
  }
  const { error } = await supabase.from("clients").update(item.patch).eq("id", id).eq("user_id", userId);
  return { result: error ? "keep" : "sent" };
}

/**
 * Sends the signed-in user's queued client contact updates to the cloud. The queue is kept per user
 * id. With a baseline, each update is conditional on the cloud row's updated_at (no device clocks);
 * 0 rows updated means a newer edit won, so the change is dropped. Failed sends stay queued. The queue
 * is re-read before writing back and only entries whose version was sent are removed, so changes
 * queued during the flush are kept. Returns how many are still waiting.
 */
export async function flushClientContactQueue(): Promise<number> {
  const userId = await getUserId().catch(() => "");
  if (!userId) return 0;
  const snapshot = readQueue(userId);
  const done: Record<string, { version: string; updatedAt?: string }> = {};
  for (const id of Object.keys(snapshot)) {
    const outcome = await sendOne(userId, id, snapshot[id]);
    if (outcome.result !== "keep") done[id] = { version: snapshot[id].version ?? snapshot[id].queuedAt, updatedAt: outcome.updatedAt };
  }
  // Merge: remove only what was flushed, and only if it wasn't edited again meanwhile.
  const latest = readQueue(userId);
  for (const [id, { version, updatedAt }] of Object.entries(done)) {
    const current = latest[id];
    if (!current) continue;
    if ((current.version ?? current.queuedAt) === version) delete latest[id];
    // Edited again during the flush: its base is now the row we just wrote.
    else if (updatedAt) current.baseline = updatedAt;
  }
  writeQueue(userId, latest);
  // The old shared queue (before per-user keys) can't be attributed to an account safely: drop it.
  window.localStorage.removeItem("clientready-client-sync-queue");
  return Object.keys(latest).length;
}
