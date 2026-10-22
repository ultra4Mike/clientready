/** Tiny in-memory IndexedDB shim: only what src/lib/device-store.ts uses. Not a general implementation. */
type Req = { result: unknown; error: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };
const later = (fn: () => void) => setTimeout(fn, 0);

export function installFakeIndexedDb() {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  const factory = {
    open(name: string) {
      const req: Req = { result: undefined, error: null };
      later(() => {
        const isNew = !dbs.has(name);
        if (isNew) dbs.set(name, new Map());
        const stores = dbs.get(name)!;
        const db = {
          objectStoreNames: { contains: (s: string) => stores.has(s) },
          createObjectStore: (s: string) => { stores.set(s, new Map()); },
          close() {},
          onversionchange: null as unknown,
          transaction(store: string) {
            const data = stores.get(store)!;
            const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error: unknown; objectStore: () => unknown } = {
              error: null,
              objectStore: () => {
                const op = (fn: () => unknown) => { const r: Req = { result: undefined, error: null }; r.result = structuredClone(fn()); later(() => tx.oncomplete?.()); return r; };
                return {
                  get: (k: string) => op(() => data.get(k)),
                  put: (v: unknown, k: string) => op(() => { data.set(k, structuredClone(v)); return k; }),
                  delete: (k: string) => op(() => { data.delete(k); }),
                  getAllKeys: () => op(() => [...data.keys()]),
                  getAll: () => op(() => [...data.values()]),
                };
              },
            };
            return tx;
          },
        };
        req.result = db;
        if (isNew) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
    deleteDatabase(name: string) {
      const req: Req = { result: undefined, error: null };
      later(() => { dbs.delete(name); req.onsuccess?.(); });
      return req;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = factory;
  return dbs;
}

export function installFakeLocalStorage() {
  const m = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
  const proxy = new Proxy(ls, { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (_t, k) => (m.has(String(k)) ? { enumerable: true, configurable: true, value: m.get(String(k)) } : undefined) });
  Object.defineProperty(globalThis, "localStorage", { value: proxy, configurable: true, writable: true });
  return m;
}
