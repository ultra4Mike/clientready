// Part 4: fingerprint / face sign-in using Supabase Auth's built-in passkeys (supabase-js >= 2.105, Auth beta).
// Supabase Auth issues the challenge, verifies the WebAuthn assertion (signature, counter, rpId, origin)
// and mints the session itself, so no service-role key, custom crypto or session minting lives in this app.
import { supabase } from "@/lib/supabase";

/** Relying-party values the Supabase dashboard must be set to, derived from NEXT_PUBLIC_SITE_URL. */
export function relyingParty(siteUrl: string | undefined) {
  const url = new URL((siteUrl || "https://clientreadyapp.com").trim());
  const rpId = url.hostname.replace(/^www\./, "");
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return { rpId: url.hostname, origins: [url.origin] };
  const origins = Array.from(new Set([url.origin, `https://${rpId}`, `https://www.${rpId}`])).filter((o) => o.startsWith("https://"));
  return { rpId, origins };
}

/** True when this browser can show the passkey prompt (WebAuthn + secure context). */
export function passkeysSupported(w: { isSecureContext?: boolean; PublicKeyCredential?: unknown; navigator?: { credentials?: unknown } } | undefined) {
  return Boolean(w && w.isSecureContext && typeof w.PublicKeyCredential === "function" && w.navigator?.credentials);
}

/** Best-effort label like "iPhone (Safari)" so the device list is readable. */
export function deviceName(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "This device";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} (${br})` : os;
}

/** Plain-English message for any passkey failure. "" means the user simply cancelled. */
export function passkeyErrorMessage(err: { message?: string; code?: string; name?: string; status?: number } | null | undefined) {
  if (!err) return "";
  const text = `${err.code || ""} ${err.name || ""} ${err.message || ""}`;
  if (/NotAllowed|ERROR_CEREMONY_ABORTED|AbortError|cancel/i.test(text)) return "";
  if (/challenge_expired/i.test(text)) return "That took a little too long. Try again.";
  if (err.status === 429 || /rate|too many/i.test(text)) return "Too many tries. Wait a minute, then try again.";
  if (/passkey.*(disabled|not enabled)|feature_disabled|webauthn.*disabled/i.test(text) || err.status === 404) return "Fingerprint / face sign-in isn't switched on yet. Use your email and password.";
  if (/InvalidState|already registered|exists/i.test(text)) return "This device is already set up.";
  if (/not found|credential|no passkey/i.test(text)) return "We don't recognise that fingerprint / face sign-in on this account. Use your password, then set it up again in Settings > Security.";
  if (/SecurityError|rp.?id|origin/i.test(text)) return "This address isn't allowed for fingerprint / face sign-in.";
  return "Fingerprint / face sign-in didn't work. Use your email and password.";
}

// Client-side throttle on top of Supabase Auth's own per-IP rate limits: stops a stuck button hammering the API.
const recent: number[] = [];
export function throttle(now = Date.now(), limit = 5, windowMs = 60_000, log = recent) {
  while (log.length && now - log[0] > windowMs) log.shift();
  if (log.length >= limit) return false;
  log.push(now);
  return true;
}

export async function signInWithPasskey() {
  if (!throttle()) return { ok: false as const, message: passkeyErrorMessage({ status: 429 }) };
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error || !data?.session) return { ok: false as const, message: passkeyErrorMessage(error || { message: "no session" }) };
  return { ok: true as const, message: "" };
}

export async function registerPasskey(name: string) {
  if (!throttle()) return { ok: false as const, message: passkeyErrorMessage({ status: 429 }) };
  const { data, error } = await supabase.auth.registerPasskey();
  if (error || !data) return { ok: false as const, message: passkeyErrorMessage(error) };
  if (name) await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: name.slice(0, 60) });
  return { ok: true as const, message: "" };
}

export async function listPasskeys() {
  const { data, error } = await supabase.auth.passkey.list();
  return { items: data || [], message: error ? passkeyErrorMessage(error) : "" };
}

export async function removePasskey(id: string) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
  return error ? passkeyErrorMessage(error) || "Couldn't remove it. Try again." : "";
}
