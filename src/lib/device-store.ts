/**
 * Small IndexedDB key-value store for this device (DB "clientready-device"), with a localStorage fallback
 * when IndexedDB is missing or broken (private mode, old WebViews). Hand-rolled; no dependencies.
 * Stores: "kv" (general), "drafts" (autosave), "queue" (offline queue), "mirror" (safety copy of localStorage).
 * Migration design for business data: docs/device-storage-migration.md.
 */
export const DEVICE_DB = "clientready-device";
const DB_VERSION = 1;
export type DeviceStoreName = "kv" | "drafts" | "queue" | "mirror";
const STORES: DeviceStoreName[] = ["kv", "drafts", "queue", "mirror"];
const FALLBACK_PREFIX = "clientready-idbfallback:";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function idb(): IDBFactory | null {
  try {
    return typeof indexedDB === "undefined" ? null : indexedDB;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const factory = idb();
  if (!factory) return (dbPromise = Promise.resolve(null));
  dbPromise = new Promise((resolve) => {
    try {
      const req = factory.open(DEVICE_DB, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** For tests: forget the cached connection (e.g. after swapping the global indexedDB). */
export function resetDeviceStore() {
  dbPromise = null;
}

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
const fbKey = (store: DeviceStoreName, key: string) => `${FALLBACK_PREFIX}${store}:${key}`;

function run<T>(store: DeviceStoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => {
    if (!db) throw new Error("no-idb");
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = op(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

export async function idbGet<T>(store: DeviceStoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, "readonly", (s) => s.get(key));
  } catch {
    const raw = ls()?.getItem(fbKey(store, key));
    return raw == null ? undefined : (JSON.parse(raw) as T);
  }
}

export async function idbSet<T>(store: DeviceStoreName, key: string, value: T): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.put(value, key));
  } catch {
    ls()?.setItem(fbKey(store, key), JSON.stringify(value));
  }
}

export async function idbDel(store: DeviceStoreName, key: string): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.delete(key));
  } catch {
    /* fall through */
  }
  ls()?.removeItem(fbKey(store, key));
}

export async function idbEntries<T>(store: DeviceStoreName): Promise<[string, T][]> {
  try {
    const [keys, values] = await Promise.all([
      run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()),
      run<T[]>(store, "readonly", (s) => s.getAll()),
    ]);
    return keys.map((k, i) => [String(k), values[i]]);
  } catch {
    const storage = ls();
    if (!storage) return [];
    const prefix = fbKey(store, "");
    return Object.keys(storage).filter((k) => k.startsWith(prefix)).map((k) => [k.slice(prefix.length), JSON.parse(storage.getItem(k)!) as T]);
  }
}

/** True when the real IndexedDB is in use (false = localStorage fallback). */
export async function usingIndexedDb() {
  return (await openDb()) !== null;
}

let persistAsked: Promise<boolean> | null = null;
/** Asks the browser once per load to keep our storage ("don't auto-clear"). Never throws. */
export function requestPersistentStorage(): Promise<boolean> {
  if (persistAsked) return persistAsked;
  persistAsked = (async () => {
    try {
      const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
      if (!storage?.persist) return false;
      if (storage.persisted && (await storage.persisted())) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  })();
  return persistAsked;
}

export type StorageHealth = { usage: number | null; quota: number | null; persisted: boolean | null; indexedDb: boolean; percentUsed: number | null };
/** Usage/quota/persisted for the health check, Settings and Help. */
export async function getStorageHealth(): Promise<StorageHealth> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  let usage: number | null = null, quota: number | null = null, persisted: boolean | null = null;
  try {
    const est = await storage?.estimate?.();
    usage = est?.usage ?? null;
    quota = est?.quota ?? null;
  } catch { /* unsupported */ }
  try {
    persisted = storage?.persisted ? await storage.persisted() : null;
  } catch { /* unsupported */ }
  return { usage, quota, persisted, indexedDb: await usingIndexedDb(), percentUsed: usage != null && quota ? Math.round((usage / quota) * 1000) / 10 : null };
}

/**
 * Safety backup: copies every clientready-* localStorage key into IndexedDB ("mirror" store) on load.
 * Read-only toward localStorage (never changes or removes a key there). Returns the number of keys copied.
 */
export async function mirrorLocalToIdb(): Promise<number> {
  const storage = ls();
  if (!storage || !(await usingIndexedDb())) return 0;
  const keys = Object.keys(storage).filter((k) => k.startsWith("clientready") && !k.startsWith(FALLBACK_PREFIX));
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value != null) await idbSet("mirror", key, { value, copiedAt: new Date().toISOString() });
  }
  await idbSet("kv", "mirror-last-run", new Date().toISOString());
  return keys.length;
}

/** Deletes the whole device DB (sign-out / delete account). */
export function deleteDeviceDb(): Promise<void> {
  const factory = idb();
  return new Promise((resolve) => {
    const finish = () => { dbPromise = null; resolve(); };
    void openDb().then((db) => {
      db?.close();
      if (!factory) return finish();
      try {
        const req = factory.deleteDatabase(DEVICE_DB);
        req.onsuccess = req.onerror = req.onblocked = finish;
      } catch {
        finish();
      }
    });
  });
}
