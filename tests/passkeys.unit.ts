import assert from "node:assert/strict";
import { deviceName, passkeyErrorMessage, passkeysSupported, relyingParty, throttle } from "../src/lib/passkeys";

// rpId / origins come from NEXT_PUBLIC_SITE_URL
assert.deepEqual(relyingParty("https://clientreadyapp.com/"), { rpId: "clientreadyapp.com", origins: ["https://clientreadyapp.com", "https://www.clientreadyapp.com"] });
assert.equal(relyingParty("https://www.clientreadyapp.com").rpId, "clientreadyapp.com");
assert.deepEqual(relyingParty("http://localhost:3300").origins, ["http://localhost:3300"]);
assert.ok(!relyingParty("http://evil.example").origins.includes("http://evil.example"), "plain http origins are never allowed");
assert.equal(relyingParty(undefined).rpId, "clientreadyapp.com");

// support detection needs WebAuthn + a secure context
const PKC = function () {};
assert.equal(passkeysSupported({ isSecureContext: true, PublicKeyCredential: PKC, navigator: { credentials: {} } }), true);
assert.equal(passkeysSupported({ isSecureContext: false, PublicKeyCredential: PKC, navigator: { credentials: {} } }), false);
assert.equal(passkeysSupported({ isSecureContext: true, navigator: { credentials: {} } }), false);
assert.equal(passkeysSupported(undefined), false);

// device names
assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "iPhone (Safari)");
assert.equal(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"), "Android (Chrome)");
assert.equal(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130"), "Windows PC (Edge)");

// errors: cancel is silent, the rest are plain English and never leak raw codes
assert.equal(passkeyErrorMessage({ name: "NotAllowedError", message: "The operation either timed out or was not allowed." }), "");
assert.equal(passkeyErrorMessage({ code: "ERROR_CEREMONY_ABORTED" }), "");
assert.match(passkeyErrorMessage({ code: "webauthn_challenge_expired" }), /too long/);
assert.match(passkeyErrorMessage({ status: 429, message: "x" }), /Too many/);
assert.match(passkeyErrorMessage({ status: 404, message: "Not Found" }), /isn't switched on/);
assert.match(passkeyErrorMessage({ code: "webauthn_credential_not_found", message: "credential not found" }), /don't recognise/);
assert.match(passkeyErrorMessage({ name: "InvalidStateError" }), /already set up/);
assert.match(passkeyErrorMessage({ message: "boom" }), /didn't work/);
assert.equal(passkeyErrorMessage(null), "");

// throttle: 5 per minute, then frees up
const log: number[] = [];
for (let i = 0; i < 5; i += 1) assert.equal(throttle(1000 + i, 5, 60_000, log), true);
assert.equal(throttle(2000, 5, 60_000, log), false);
assert.equal(throttle(62_000, 5, 60_000, log), true);
console.log("passkeys.unit ok");
