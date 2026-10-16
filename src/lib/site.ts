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
