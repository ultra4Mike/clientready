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
  queueContactPatch(target.id, patch);
  await flushClientContactQueue();
  return next;
}

const QUEUE_KEY = "clientready-client-sync-queue";
type Queue = Record<string, Partial<Contact>>;

function readQueue(): Queue {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function queueContactPatch(id: string, patch: Partial<Contact>) {
  const queue = readQueue();
  queue[id] = { ...(queue[id] || {}), ...patch };
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Sends queued client contact updates to the cloud. A failed update (offline, signed out, error)
 * stays queued and is retried on the next call. Returns how many are still waiting.
 */
export async function flushClientContactQueue(): Promise<number> {
  const queue = readQueue();
  const ids = Object.keys(queue);
  if (!ids.length) return 0;
  const userId = await getUserId().catch(() => null);
  if (!userId) return ids.length;
  for (const id of ids) {
    const { error } = await supabase.from("clients").update(queue[id]).eq("id", id).eq("user_id", userId);
    if (!error) delete queue[id];
  }
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return Object.keys(queue).length;
}
