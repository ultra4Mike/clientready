# Moving business data from localStorage to IndexedDB (design, not done yet)

Status: NOT migrated in this pass (Dev is editing the pages that read these keys). Today only
`mirrorLocalToIdb()` (src/lib/device-store.ts) runs: it copies every `clientready*` localStorage key
into the IndexedDB `mirror` store as a read-only safety copy.

## Plan
1. **Inventory** every `clientready-*` key and its reader/writer (account-cache, doc-sync, client-sync, prefs, sync queue).
2. **Async accessor layer**: one `src/lib/device-data.ts` with `loadX()/saveX()` per key, backed by `idbGet/idbSet("kv", key)`.
   Pages switch from `localStorage.getItem` to the accessor one at a time (Dev, page by page).
3. **Dual-write window** (one deploy): accessor writes IndexedDB and localStorage; reads IndexedDB first, falls back to localStorage.
4. **One-time copy**: on first load after deploy, for each key with no IDB value copy from localStorage (`kv` flag `migrated-v1`).
5. **Cut over** (next deploy): stop writing localStorage for keys > 50 KB (documents, clients); keep small prefs there.
6. **Rollback**: localStorage still holds the dual-written copy during step 3, and `mirror` holds the pre-migration copy.
7. **Wipe**: `wipeThisDevice()` already deletes the device DB (`DEVICE_DB`), so sign-out stays clean.

## Risks
- Sync reads are synchronous today; the async switch touches page render order (why Dev owns step 2).
- Safari evicts IndexedDB after 7 days without use unless installed / persisted: `requestPersistentStorage()` runs on drafts init.
- Quota: show `getStorageHealth()` in Settings and the health check.
