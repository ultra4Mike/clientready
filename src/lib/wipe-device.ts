/** Removes every ClientReady key from this browser (business cache, parked docs, sync queue, prefs). */
export function wipeThisDevice() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    Object.keys(store).filter((key) => key.startsWith("clientready") || key.startsWith("sb-")).forEach((key) => store.removeItem(key));
  }
}

