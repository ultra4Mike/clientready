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
