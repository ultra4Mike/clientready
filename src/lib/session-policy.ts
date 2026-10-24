/**
 * Session security (Part 3): "Keep me signed in on this device" and idle auto sign-out.
 *
 * - Keep unchecked: the login only lasts for this browser session. A session cookie (no Expires, shared by every
 *   tab, dropped when the browser closes) marks a live browser session. On a fresh browser start the cookie is gone,
 *   so the stored Supabase token is removed synchronously BEFORE the Supabase client is created (no flash of a
 *   signed-in state). Note: browsers that restore the previous session ("Continue where you left off") may also
 *   restore session cookies; idle sign-out still applies then.
 * - Idle: owner/office default 30 min (15/30/60/240/never), crew default never. The last-activity time lives in
 *   localStorage, so every tab shares it (activity in one tab keeps the others alive; sign-out in one signs out all).
 *
 * This module has no imports so supabase.ts can run it at module load.
 */
export const KEEP_KEY = "clientready-keep-signed-in"; // "1" persistent, "0" this browser session only
export const ROLE_KEY = "clientready-last-role"; // "crew" | "owner"
export const IDLE_KEY = "clientready-idle-minutes";
export const ACTIVITY_KEY = "clientready-last-activity";
export const PENDING_KEY = "clientready-policy-signout"; // "closed" | "idle": AppShell finishes the sign-out
export const LIVE_COOKIE = "cr_live";
export const TAB_MARK = "clientready-tab-live"; // sessionStorage: this tab was opened during a live login
export const BEAT_KEY = "clientready-live-beat"; // localStorage: last heartbeat from any open tab
export const TAB_ID_KEY = "clientready-tab-id";
export const BEAT_MS = 10_000;
export const BEAT_STALE_MS = 30_000;
export const IDLE_CHOICES = [15, 30, 60, 240, 0] as const; // 0 = never
export const WARN_MS = 60_000;

export type Role = "crew" | "owner";

export function idleChoiceLabel(minutes: number) {
  return minutes === 0 ? "Never" : minutes >= 60 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;
}

/** The idle limit in minutes (0 = never). A saved choice wins; otherwise owners 30, crew never. */
export function idleMinutes(raw: string | null | undefined, role: Role | string | null | undefined): number {
  const n = Number(raw);
  if (raw != null && raw !== "" && (IDLE_CHOICES as readonly number[]).includes(n)) return n;
  return role === "crew" ? 0 : 30;
}

/** The checkbox default on the login page: crew keep their login (they clock in on phones), owners don't. */
export function keepDefault(lastRole: string | null | undefined) {
  return lastRole === "crew";
}

export type IdleState = { state: "active" | "warn" | "expired" | "off"; remainingMs: number };
export function idleState(now: number, lastActivity: number, limitMinutes: number): IdleState {
  if (!limitMinutes) return { state: "off", remainingMs: Infinity };
  if (!Number.isFinite(lastActivity) || lastActivity <= 0) return { state: "active", remainingMs: limitMinutes * 60_000 };
  const remainingMs = lastActivity + limitMinutes * 60_000 - now;
  if (remainingMs <= 0) return { state: "expired", remainingMs: 0 };
  return { state: remainingMs <= WARN_MS ? "warn" : "active", remainingMs };
}

export function hasCookie(cookie: string, name: string) {
  return cookie.split(";").some((part) => part.trim().startsWith(`${name}=`));
}

/** Why a stored session must be dropped at startup, or "" to keep it. */
/**
 * "This browser session is still live" for keep-unchecked logins. A session cookie alone is NOT enough: Chrome keeps
 * session cookies across restarts with a persistent profile (deploy 28 retest: the login survived a full restart).
 * Live = this tab carries the sessionStorage mark, or another open tab sent a heartbeat in the last 30s.
 */
export function liveSession(input: { tabMark: boolean; lastBeat: number; now: number }) {
  return input.tabMark || (input.lastBeat > 0 && input.now - input.lastBeat < BEAT_STALE_MS);
}

export function startupDropReason(input: { hasSession: boolean; keep: string | null; liveCookie: boolean; now: number; lastActivity: number; idleLimit: number }): "" | "closed" | "idle" {
  if (!input.hasSession) return "";
  if (input.keep === "0" && !input.liveCookie) return "closed";
  if (idleState(input.now, input.lastActivity, input.idleLimit).state === "expired") return "idle";
  return "";
}

export const isAuthKey = (key: string) => /^sb-.+-auth-token(-code-verifier)?$/.test(key);

function authKeys(store: Storage) {
  const out: string[] = [];
  for (let i = 0; i < store.length; i += 1) { const k = store.key(i); if (k && isAuthKey(k)) out.push(k); }
  return out;
}

/** Remove the Supabase auth token(s) and any sb- auth cookies, synchronously. */
export function dropStoredSession(reason: "closed" | "idle") {
  try {
    authKeys(window.localStorage).forEach((k) => window.localStorage.removeItem(k));
    authKeys(window.sessionStorage).forEach((k) => window.sessionStorage.removeItem(k));
    window.localStorage.setItem(PENDING_KEY, reason);
    window.localStorage.removeItem(ACTIVITY_KEY);
    window.localStorage.removeItem(BEAT_KEY);
    window.sessionStorage.removeItem(TAB_MARK);
  } catch { /* storage blocked */ }
  try {
    // There is no server auth cookie today (auth is token-in-storage); expire any sb- cookie defensively.
    document.cookie.split(";").map((p) => p.trim().split("=")[0]).filter((n) => n.startsWith("sb-")).forEach((n) => { document.cookie = `${n}=; Max-Age=0; path=/`; });
  } catch { /* no cookies */ }
}

/** Runs once at module load of the Supabase client, before it reads storage. */
export function applySessionPolicyEarly() {
  if (typeof window === "undefined") return "";
  try {
    const ls = window.localStorage;
    const reason = startupDropReason({
      hasSession: authKeys(ls).length > 0,
      keep: ls.getItem(KEEP_KEY),
      liveCookie: liveSession({ tabMark: window.sessionStorage.getItem(TAB_MARK) === "1", lastBeat: lastBeat(ls.getItem(BEAT_KEY)), now: Date.now() }),
      now: Date.now(),
      lastActivity: Number(ls.getItem(ACTIVITY_KEY) || 0),
      idleLimit: idleMinutes(ls.getItem(IDLE_KEY), ls.getItem(ROLE_KEY)),
    });
    if (reason) dropStoredSession(reason);
    else if (authKeys(ls).length) startBeat();
    return reason;
  } catch { return ""; }
}

let beating = false;
/** Mark this tab live and keep a shared heartbeat while it is open (see liveSession). */
export function startBeat() {
  try {
    window.sessionStorage.setItem(TAB_MARK, "1");
    let id = window.sessionStorage.getItem(TAB_ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2); window.sessionStorage.setItem(TAB_ID_KEY, id); }
    const tab = id;
    const write = (stamp: number | null) => {
      try {
        const map = readBeats(window.localStorage.getItem(BEAT_KEY));
        if (stamp) map[tab] = stamp; else delete map[tab];
        if (Object.keys(map).length) window.localStorage.setItem(BEAT_KEY, JSON.stringify(map)); else window.localStorage.removeItem(BEAT_KEY);
      } catch { /* storage blocked */ }
    };
    write(Date.now());
    if (beating) return;
    beating = true;
    window.setInterval(() => write(Date.now()), BEAT_MS);
    // Closing the browser fires pagehide in every tab: each tab removes its own beat, so a quick relaunch finds none.
    // (A reload or same-tab navigation keeps the sessionStorage tab mark, so it stays signed in.)
    window.addEventListener("pagehide", () => write(null));
    window.addEventListener("pageshow", (event) => { if ((event as PageTransitionEvent).persisted) write(Date.now()); });
  } catch { /* storage blocked */ }
}

/** Heartbeats per open tab ({tabId: ms}); tolerates the older single-number format. */
export function readBeats(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); if (typeof v === "number") return { legacy: v }; if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, t]) => typeof t === "number")) as Record<string, number>; } catch { /* bad value */ }
  return {};
}
export function lastBeat(raw: string | null) { return Math.max(0, ...Object.values(readBeats(raw))); }

/** Call right after a successful sign-in. */
export function markSignedIn(keep: boolean, role: Role) {
  try {
    window.localStorage.setItem(KEEP_KEY, keep ? "1" : "0");
    window.localStorage.setItem(ROLE_KEY, role);
    window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    window.localStorage.removeItem(PENDING_KEY);
    document.cookie = `${LIVE_COOKIE}=1; path=/; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* storage blocked */ }
  startBeat();
}

export function touchActivity(now = Date.now()) {
  try { window.localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* storage blocked */ }
}

export function loginReasonMessage(reason: string | null) {
  if (reason === "idle") return "You were signed out after a while with no activity, to keep your business data safe. Log in again to pick up where you left off.";
  if (reason === "closed") return "You were signed out when the browser closed. Tick \u201cKeep me signed in\u201d to stay signed in on this device.";
  return "";
}
