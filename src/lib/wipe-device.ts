/** Removes every ClientReady key from this browser (business cache, parked docs, sync queue, prefs). */
export function wipeThisDevice() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    Object.keys(store).filter((key) => key.startsWith("clientready") || key.startsWith("sb-")).forEach((key) => store.removeItem(key));
  }
}


/** Drops the service worker's page/asset caches (no business data is in them, but nothing should outlive a deleted account). */
export async function clearOfflineCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear-caches");
    if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  } catch {
    // best effort
  }
}
