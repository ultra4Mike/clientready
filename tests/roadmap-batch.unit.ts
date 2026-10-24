import assert from "node:assert/strict";
import { tipCents } from "../src/lib/tip";
import { bookingError, parseServices, slugify, validOwnerKey } from "../src/lib/booking";
import { profitAlertsForDoc } from "../src/lib/profit-alerts";

// Tip
assert.equal(tipCents(10000, { kind: "none" }), 0);
assert.equal(tipCents(10000, { kind: "percent", percent: 15 }), 1500);
assert.equal(tipCents(10050, { kind: "percent", percent: 10 }), 1005);
assert.equal(tipCents(10000, { kind: "percent", percent: 33 }), 0, "only 10/15/20");
assert.equal(tipCents(10000, { kind: "custom", dollars: "12.345" }), 1235);
assert.equal(tipCents(10000, { kind: "custom", dollars: "-5" }), 500, "non-digits stripped");
assert.equal(tipCents(1000, { kind: "custom", dollars: "999" }), 1000, "capped at the charge");
assert.equal(tipCents(10000, null), 0);

// Booking
assert.ok(validOwnerKey("acme-lawn"));
assert.ok(validOwnerKey("0b7e7c2e-1111-4222-8333-444455556666"));
assert.ok(!validOwnerKey("a"));
assert.ok(!validOwnerKey("../x"));
assert.equal(slugify("Joe's Lawn & Garden!"), "joe-s-lawn-garden");
assert.deepEqual(parseServices("Mowing\n\n Mowing \nCleanup"), ["Mowing", "Cleanup"]);
const base = { name: "Jo", phone: "", email: "jo@x.com", address: "", service: "", preferred: "", note: "", photos: [] as string[] };
assert.equal(bookingError(base), "");
assert.match(bookingError({ ...base, name: " " }), /name/);
assert.match(bookingError({ ...base, email: "" }), /phone number or email/);
assert.equal(bookingError({ ...base, email: "", phone: "(555) 123-4567" }), "");
assert.match(bookingError({ ...base, photos: ["javascript:alert(1)"] }), /photo/);

// Profit alert on the job page (same math)
const doc = { id: "1", type: "invoice", data: { status: "sent", items: [{ description: "x", qty: "1", rate: "100" }], jobCosts: { parts: "90" } } };
const alerts = profitAlertsForDoc(doc, 20);
assert.ok(alerts.some((a) => a.kind === "low-margin"), JSON.stringify(alerts));
assert.deepEqual(profitAlertsForDoc({ ...doc, data: { ...doc.data, jobCosts: { parts: "10" } } }, 20), []);
assert.deepEqual(profitAlertsForDoc(null, 20), []);
console.log("roadmap-batch ok");
