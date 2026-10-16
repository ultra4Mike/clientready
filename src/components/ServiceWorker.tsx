"use client";

import { useEffect } from "react";

/** Registers /sw.js (production builds only; secure contexts). Turn off on a device with localStorage clientready-sw-off=1. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    if (window.localStorage.getItem("clientready-sw-off") === "1") {
      navigator.serviceWorker.getRegistrations().then((list) => list.forEach((registration) => registration.unregister())).catch(() => undefined);
      return;
    }
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
