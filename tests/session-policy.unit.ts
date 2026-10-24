import assert from "node:assert/strict";
import { hasCookie, idleMinutes, idleState, isAuthKey, keepDefault, loginReasonMessage, startupDropReason } from "../src/lib/session-policy";

// idle limits
assert.equal(idleMinutes(null, "owner"), 30);
assert.equal(idleMinutes(null, null), 30);
assert.equal(idleMinutes(null, "crew"), 0);
assert.equal(idleMinutes("15", "owner"), 15);
assert.equal(idleMinutes("240", "crew"), 240);
assert.equal(idleMinutes("0", "owner"), 0);
assert.equal(idleMinutes("7", "owner"), 30, "unknown choice falls back");
// keep default
assert.equal(keepDefault("crew"), true);
assert.equal(keepDefault("owner"), false);
assert.equal(keepDefault(null), false);
// idle state
const t = 1_000_000_000;
assert.equal(idleState(t, t - 10 * 60_000, 30).state, "active");
assert.equal(idleState(t, t - 29.5 * 60_000, 30).state, "warn");
assert.equal(idleState(t, t - 30 * 60_000, 30).state, "expired");
assert.equal(idleState(t, t - 999 * 60_000, 0).state, "off");
assert.equal(idleState(t, 0, 30).state, "active", "no activity recorded yet is not expired");
// cookies / keys
assert.equal(hasCookie("a=1; cr_live=1", "cr_live"), true);
assert.equal(hasCookie("xcr_live=1", "cr_live"), false);
assert.equal(isAuthKey("sb-abc-auth-token"), true);
assert.equal(isAuthKey("sb-abc-auth-token-code-verifier"), true);
assert.equal(isAuthKey("clientready-documents"), false);
// startup drops
const base = { hasSession: true, keep: "0", liveCookie: true, now: t, lastActivity: t - 60_000, idleLimit: 30 };
assert.equal(startupDropReason(base), "");
assert.equal(startupDropReason({ ...base, liveCookie: false }), "closed", "browser closed, not kept");
assert.equal(startupDropReason({ ...base, keep: "1", liveCookie: false }), "", "kept survives a restart");
assert.equal(startupDropReason({ ...base, keep: null, liveCookie: false }), "", "legacy logins (no choice yet) are untouched");
assert.equal(startupDropReason({ ...base, keep: "1", lastActivity: t - 31 * 60_000 }), "idle");
assert.equal(startupDropReason({ ...base, keep: "1", lastActivity: t - 999 * 60_000, idleLimit: 0 }), "", "crew never");
assert.equal(startupDropReason({ ...base, hasSession: false, liveCookie: false }), "");
assert.match(loginReasonMessage("idle"), /no activity/);
assert.equal(loginReasonMessage(null), "");
console.log("session-policy ok");

// Deploy 28 retest: a restored session cookie must not keep an unchecked login alive; the tab mark / heartbeat decide.
import { liveSession, BEAT_STALE_MS } from "../src/lib/session-policy";
assert.equal(liveSession({ tabMark: true, lastBeat: 0, now: t }), true, "this tab was opened during the login");
assert.equal(liveSession({ tabMark: false, lastBeat: t - 5_000, now: t }), true, "another tab is open (new tab)");
assert.equal(liveSession({ tabMark: false, lastBeat: t - BEAT_STALE_MS - 1, now: t }), false, "browser was closed");
assert.equal(liveSession({ tabMark: false, lastBeat: 0, now: t }), false, "no heartbeat at all");
console.log("session-policy live-session: ok");
import { lastBeat, readBeats } from "../src/lib/session-policy";
assert.deepEqual(readBeats(null), {});
assert.equal(lastBeat(JSON.stringify({ a: 5, b: 9 })), 9, "newest tab beat");
assert.equal(lastBeat("123"), 123, "older single-number format");
assert.equal(lastBeat("{}"), 0, "every tab removed its beat on close");
console.log("session-policy beats: ok");

// Deploy 29 retest: a restored tab after closing the browser (keep unticked) says "closed", not "idle".
{
  const b = { hasSession: true, keep: "0", liveCookie: true, now: t, lastActivity: t - 120 * 60_000, idleLimit: 30 };
  assert.equal(startupDropReason({ ...b, lastBeat: t - 90 * 60_000 }), "closed", "restored tab, browser was closed");
  assert.equal(startupDropReason({ ...b, lastBeat: t - 5_000 }), "idle", "open tab went idle");
  assert.equal(startupDropReason({ ...b, keep: "1", lastBeat: 0 }), "idle", "kept login still says idle");
  assert.equal(loginReasonMessage("closed"), "You were signed out because you closed the browser. Tick \u201cKeep me signed in\u201d to stay signed in on this device.");
  assert.equal(loginReasonMessage("session_ended"), loginReasonMessage("closed"));
  console.log("session-policy d30 ok");
}
