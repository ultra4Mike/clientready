"use client";

import { useEffect } from "react";
import { deepLinkPath } from "@/lib/deep-link";

type Listener = { remove: () => void };
type AppPlugin = {
  addListener: (event: string, handler: (data: { url?: string; canGoBack?: boolean }) => void) => Promise<Listener> | Listener;
  exitApp: () => void;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { App?: AppPlugin } };

/**
 * Only active inside the iOS/Android shell (window.Capacitor is injected by the native app; the web
 * build has no Capacitor dependency). Opens deep links in-app and handles Android's back button.
 */
export default function NativeBridge() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    const app = cap?.Plugins?.App;
    if (!cap?.isNativePlatform?.() || !app) return;
    document.documentElement.dataset.native = cap.getPlatform?.() || "native";
    const listeners: Promise<Listener>[] = [];
    listeners.push(Promise.resolve(app.addListener("appUrlOpen", ({ url }) => {
      const path = deepLinkPath(url || "", window.location.host);
      if (path && path !== window.location.pathname + window.location.search + window.location.hash) window.location.assign(path);
    })));
    listeners.push(Promise.resolve(app.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else app.exitApp();
    })));
    return () => listeners.forEach((listener) => listener.then((handle) => handle.remove()).catch(() => undefined));
  }, []);
  return null;
}
