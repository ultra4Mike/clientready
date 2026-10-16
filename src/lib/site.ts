/** Main production URL. Override with NEXT_PUBLIC_SITE_URL (e.g. a staging deployment). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://clientreadyapp.com").replace(/\/+$/, "");

/** Hosts that serve the app (deep links). The old Vercel host keeps working. */
export const SITE_HOSTS = Array.from(new Set([new URL(SITE_URL).host, "clientreadyapp.com", "www.clientreadyapp.com", "clientready-six.vercel.app"]));

/**
 * Origin for links customers receive and auth emails: NEXT_PUBLIC_SITE_URL when set, otherwise the
 * page's own origin (so local and preview builds link to themselves).
 */
export function linkOrigin() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  return typeof window === "undefined" ? SITE_URL : window.location.origin;
}

/**
 * Origin printed on paper (invoice QR codes): always the main site (https://clientreadyapp.com unless
 * NEXT_PUBLIC_SITE_URL says otherwise), even when the owner opened the app on another host. Local
 * development keeps its own origin so the code can be scanned in tests.
 */
export function printOrigin() {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return window.location.origin;
  return SITE_URL;
}
