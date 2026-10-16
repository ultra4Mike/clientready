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
    queueContactPatch(userId, target.id, patch);
    await flushClientContactQueue();
  }
  return next;
}

const QUEUE_PREFIX = "clientready-client-sync-queue:";
type Queued = { patch: Partial<Contact>; queuedAt: string };
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

function queueContactPatch(userId: string, id: string, patch: Partial<Contact>) {
  const queue = readQueue(userId);
  queue[id] = { patch: { ...(queue[id]?.patch || {}), ...patch }, queuedAt: new Date().toISOString() };
  writeQueue(userId, queue);
}

/**
 * Sends the signed-in user's queued client contact updates to the cloud. The queue is kept per user
 * id, so switching accounts never sends (or drops) another account's updates. A failed update stays
 * queued for the next call; an update is skipped when the cloud row was changed after it was queued
 * (when the clients table has updated_at). Returns how many are still waiting.
 */
export async function flushClientContactQueue(): Promise<number> {
  const userId = await getUserId().catch(() => "");
  if (!userId) return 0;
  const queue = readQueue(userId);
  for (const id of Object.keys(queue)) {
    const { patch, queuedAt } = queue[id];
    const { data: row, error: readError } = await supabase.from("clients").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (readError) continue; // offline or error: keep for next time
    if (!row) {
      delete queue[id]; // client gone from this account
      continue;
    }
    const cloudUpdated = typeof (row as Record<string, unknown>).updated_at === "string" ? String((row as Record<string, unknown>).updated_at) : "";
    if (cloudUpdated && new Date(cloudUpdated).getTime() > new Date(queuedAt).getTime()) {
      delete queue[id]; // a newer edit is already in the cloud: don't overwrite it
      continue;
    }
    const update = cloudUpdated ? { ...patch, updated_at: new Date().toISOString() } : patch;
    const { error } = await supabase.from("clients").update(update).eq("id", id).eq("user_id", userId);
    if (!error) delete queue[id];
  }
  writeQueue(userId, queue);
  // The old shared queue (before per-user keys) can't be attributed to an account safely: drop it.
  window.localStorage.removeItem("clientready-client-sync-queue");
  return Object.keys(queue).length;
}
