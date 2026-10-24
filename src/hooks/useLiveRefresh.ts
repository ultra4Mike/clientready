"use client";
/**
 * pt473u: two devices open at once must agree. Server-backed screens (Timesheet alerts, Dashboard "Needs attention")
 * re-read the server when the app comes back to the front (visibilitychange / focus / pageshow from bfcache), when
 * the network returns, when another tab on this device saves (storage event), and every `intervalMs` while visible.
 * Calls are throttled so focus + visibilitychange firing together cause one read. The callback must be a quiet
 * background refresh (no loading flash): it keeps the current screen until the new server copy lands.
 */
import { useEffect, useRef } from "react";

export const LIVE_REFRESH_INTERVAL_MS = 60_000;
export const LIVE_REFRESH_THROTTLE_MS = 2_000;

export function liveRefreshTriggers(win: Pick<Window, "addEventListener" | "removeEventListener">, doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">, run: (reason: string) => void, opts: { intervalMs?: number; storageKeys?: string[]; throttleMs?: number; now?: () => number } = {}) {
  const now = opts.now || (() => Date.now());
  const throttle = opts.throttleMs ?? LIVE_REFRESH_THROTTLE_MS;
  let last = -Infinity;
  const fire = (reason: string) => { if (doc.visibilityState === "hidden") return; const t = now(); if (t - last < throttle) return; last = t; run(reason); };
  const onVis = () => fire("visible");
  const onFocus = () => fire("focus");
  const onOnline = () => fire("online");
  const onShow = (e: Event) => { if ((e as PageTransitionEvent).persisted) fire("pageshow"); };
  const onStorage = (e: Event) => { const k = (e as StorageEvent).key; if (!opts.storageKeys || k == null || opts.storageKeys.includes(k)) fire("storage"); };
  doc.addEventListener("visibilitychange", onVis);
  win.addEventListener("focus", onFocus);
  win.addEventListener("online", onOnline);
  win.addEventListener("pageshow", onShow);
  win.addEventListener("storage", onStorage);
  const timer = opts.intervalMs ? setInterval(() => fire("interval"), opts.intervalMs) : null;
  return () => {
    doc.removeEventListener("visibilitychange", onVis);
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("online", onOnline);
    win.removeEventListener("pageshow", onShow);
    win.removeEventListener("storage", onStorage);
    if (timer) clearInterval(timer);
  };
}

export function useLiveRefresh(run: (reason: string) => void, opts: { intervalMs?: number; storageKeys?: string[]; enabled?: boolean } = {}) {
  const ref = useRef(run);
  useEffect(() => { ref.current = run; });
  const { intervalMs = LIVE_REFRESH_INTERVAL_MS, enabled = true } = opts;
  const keys = (opts.storageKeys || []).join("|");
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    return liveRefreshTriggers(window, document, (r) => ref.current(r), { intervalMs, storageKeys: keys ? keys.split("|") : undefined });
  }, [enabled, intervalMs, keys]);
}
