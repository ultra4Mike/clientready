import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMoneyInput, toMinor } from "../src/lib/stripe-money";
import { itemsError, validSince } from "../src/lib/api-validate";
import { missingDeposits } from "../src/lib/proposal-deposit";
import type { Payment } from "../src/lib/payments";

// Strict money parser.
assert.equal(parseMoneyInput("125.50"), 125.5);
assert.equal(parseMoneyInput("$1,234.56"), 1234.56);
assert.equal(parseMoneyInput("1234"), 1234);
assert.equal(parseMoneyInput(" 12 "), 12);
for (const bad of ["5e2", "-5", "-5.00", "1,23", "12,34.5", "1.234", "", ".", "abc", "1..2", "0x10", "Infinity", "1 000", "5,", null, undefined, {}])
  assert.equal(parseMoneyInput(bad as never), null, `should reject ${String(bad)}`);
// Zero-decimal currencies.
assert.equal(parseMoneyInput("5,000", "jpy"), 5000);
assert.equal(parseMoneyInput("5000.5", "jpy"), null);
assert.equal(toMinor(5000, "jpy"), 5000);
assert.equal(toMinor(5000, "KRW"), 5000);
assert.equal(toMinor(5.25, "usd"), 525);
assert.equal(toMinor(0.29, "usd"), 29);
assert.equal(toMinor(1.005, "usd"), 101);

// R74 validation.
assert.ok(validSince("2026-10-24"));
assert.ok(validSince("2026-10-24T08:00:00Z"));
assert.ok(validSince("2026-10-24T08:00:00.123-05:00"));
for (const bad of ["yesterday", "2026-13-01", "2026-02-30", "1e9", "2026-10-24T25:00:00Z", "'; drop"]) assert.equal(validSince(bad), false, bad);
assert.equal(itemsError(undefined), "");
assert.equal(itemsError([{ description: "a", qty: 2, rate: "10.5" }]), "");
assert.ok(itemsError([{ qty: -1, rate: 10 }]));
assert.ok(itemsError([{ qty: 1, rate: "-10" }]));
assert.ok(itemsError([{ qty: 0, rate: 10 }]));
assert.ok(itemsError([{ qty: "1e3", rate: 10 }]));
assert.ok(itemsError("x"));

// R21: same amount + day but a different reference doesn't hide the deposit.
const p = (id: string, amount: number, date: string, ref = "", method = "Card"): Payment => ({ id, amount: String(amount), method, date, ref });
assert.equal(missingDeposits([p("d1", 100, "2026-10-21", "pi_A")], [p("x", 100, "2026-10-21", "pi_B")]).length, 1);
assert.equal(missingDeposits([p("d1", 100, "2026-10-21", "chk 12", "Check")], [p("x", 100, "2026-10-21", "", "Cash")]).length, 1);
assert.equal(missingDeposits([p("d1", 100, "2026-10-21", "pi_A")], [p("srv", 100, "2026-10-21T07:00:00Z", "pi_A")]).length, 0);
assert.equal(missingDeposits([p("d1", 100, "2026-10-21")], [p("srv", 100, "2026-10-21")]).length, 0);

// Route wiring.
const refund = readFileSync("src/app/api/pay/refund/route.ts", "utf8");
assert.match(refund, /parseMoneyInput\(body\?\.amount/);
assert.match(refund, /toMinor\(amount/);
assert.doesNotMatch(refund, /idempotency-key": `cr-refund-\$\{requestId\}/);
assert.match(refund, /idempotency_error/);
const email = readFileSync("src/app/api/email/send/route.ts", "utf8");
assert.ok(email.indexOf("Sign in first.") < email.indexOf("Email sending is not set up"));
assert.match(email, /email_quota_give_back/);
assert.match(email, /idempotency-key/);
const api = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
assert.match(api, /validSince\(since\)/);
const crew = readFileSync("src/app/crew/page.tsx", "utf8");
assert.match(crew, /openEntries\.filter/);
console.log("qa2-fixes ok");
