/**
 * Offline queue for crew uploads that carry photos ("mark done" photos, expense receipts).
 * Kept in IndexedDB (photos are too big for localStorage), per signed-in user. Only network failures
 * are queued; a server "no" (not assigned, bad photo) is shown right away and never retried blindly.
 */
export type QueueKind = "done" | "expense" | "report" | "check" | "clock-in" | "clock-out";
export type QueueItem = {
  id: string;
  user: string;
  kind: QueueKind;
  docId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const DB = "clientready-queue";
const STORE = "uploads";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = work(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request ? request.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export function isNetworkError(message: string) {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}

/** A stable key for one upload; sent to the server so a retry after a lost reply adds nothing (R14). */
export function newUploadKey() {
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueue(item: Omit<QueueItem, "id" | "createdAt" | "attempts"> & { id?: string }) {
  const full: QueueItem = { ...item, id: item.id || newUploadKey(), createdAt: new Date().toISOString(), attempts: 0 };
  await run("readwrite", (store) => store.put(full));
  // Ask the browser not to evict queued photos under storage pressure (best effort; ignored if unsupported).
  try { void navigator.storage?.persist?.().catch(() => undefined); } catch { /* ignore */ }
  return full;
}

export async function queued(user: string): Promise<QueueItem[]> {
  const all = ((await run("readonly", (store) => store.getAll())) || []) as QueueItem[];
  return all.filter((item) => item.user === user).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeQueued(id: string) {
  await run("readwrite", (store) => store.delete(id));
}

/** R41: the crew member chose Retry on a refused item: clear the error so the next send tries it again. */
export async function retryQueued(item: QueueItem) {
  const { lastError: _e, ...rest } = item;
  void _e;
  await save(rest as QueueItem);
}

async function save(item: QueueItem) {
  await run("readwrite", (store) => store.put(item));
}

/**
 * Sends this user's queued items in order. send() returns "" on success or an error message.
 * Stops at the first network failure (still offline); a server refusal is kept with lastError for the
 * person to see and discard. Returns how many were sent.
 */
let flushing: Promise<number> | null = null;

export function flushQueue(user: string, send: (item: QueueItem) => Promise<string>): Promise<number> {
  // One flush at a time in this tab: the online event, page load and Send now can fire together,
  // and two overlapping flushes would send the same item twice.
  if (flushing) return flushing;
  flushing = flushOnce(user, send).finally(() => { flushing = null; });
  return flushing;
}

async function flushOnce(user: string, send: (item: QueueItem) => Promise<string>) {
  let sent = 0;
  for (const item of await queued(user)) {
    if (item.lastError) continue;
    const error = await send(item).catch((reason: unknown) => String((reason as Error)?.message || reason));
    if (!error) {
      await removeQueued(item.id);
      sent++;
    } else if (isNetworkError(error)) {
      break;
    } else {
      await save({ ...item, attempts: item.attempts + 1, lastError: error });
    }
  }
  return sent;
}

/** Removes one user's unsent items (log out on a shared phone); other users' items stay. */
export async function clearUserQueue(user: string) {
  for (const item of await queued(user)) await removeQueued(item.id);
}

/**
 * Before logging out: if this user has unsent uploads, ask; on OK they are removed from this phone.
 * Returns false when the person chose to stay signed in.
 */
export async function confirmLogoutWithQueue(user: string) {
  if (!user || typeof indexedDB === "undefined") return true;
  const pending = await queued(user).catch(() => [] as QueueItem[]);
  if (!pending.length) return true;
  const ok = window.confirm(`${pending.length} upload${pending.length === 1 ? " hasn't" : "s haven't"} been sent yet (job photos or receipts). If you log out now, ${pending.length === 1 ? "it" : "they"} will be deleted from this phone. Log out anyway?`);
  if (ok) await clearUserQueue(user).catch(() => undefined);
  return ok;
}

/** Wipe on sign-out/account deletion. */
export function clearQueueDb() {
  try {
    indexedDB.deleteDatabase(DB);
  } catch {
    // ignore
  }
}
