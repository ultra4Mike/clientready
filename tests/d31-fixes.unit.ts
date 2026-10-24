import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanApprovalNote, APPROVAL_NOTE_MAX } from "../src/lib/approval";
import { markedSentAction } from "../src/lib/email";
import { publicDocData } from "../src/lib/portal-safe";

// 1) Phone-approval note is stored whole (no split at " - ", no word limit), capped at 500.
assert.equal(cleanApprovalNote("QA test note - private"), "QA test note - private");
assert.equal(cleanApprovalNote("  a - b - c  "), "a - b - c");
assert.equal(cleanApprovalNote("x".repeat(900)).length, APPROVAL_NOTE_MAX);
assert.equal(APPROVAL_NOTE_MAX, 500);
const ui = readFileSync("src/components/PhoneApproval.tsx", "utf8");
assert.ok(!/maxLength=\{200\}/.test(ui) && /maxLength=\{APPROVAL_NOTE_MAX\}/.test(ui), "note field allows 500");
assert.match(readFileSync("src/lib/approval.ts", "utf8"), /const note = cleanApprovalNote\(options\.note\)/);

// 2) Mark sent from the email app: history wording + cloud-first save in logEmail.
assert.equal(markedSentAction("mailto"), "Marked sent (sent from email app)");
assert.equal(markedSentAction("email"), "Marked sent (emailed from ClientReady)");
const email = readFileSync("src/lib/email.ts", "utf8");
assert.match(email, /from\("documents"\)\.select\("data"\)/, "logEmail applies the change to the cloud copy");
assert.match(email, /data\.status = "sent"/);

// 4) Portal copy never carries crew pay / employee data.
const out = publicDocData({ invoiceNumber: "INV-1", items: [{ description: "Mulch" }], crewMoved: [{ name: "QA Worker", rate: "25", hours: "2", bonus: "5" }], crewMovedTo: "r", jobRate: "48", taskType: "Laborer", pin: { lat: 1, lng: 2 }, lat: 1, lng: 2, crew: [{ name: "QA Worker" }] });
assert.ok(!JSON.stringify(out).includes("QA Worker"));
for (const k of ["crewMoved", "crewMovedTo", "jobRate", "taskType", "pin", "lat", "lng", "crew"]) assert.ok(!(k in out), k);
assert.ok("items" in out);
const sql = readFileSync("supabase/migrations/20261105100000_portal_strip_crew_pay.sql", "utf8");
for (const k of ["crewMoved", "crewMovedTo", "jobRate", "taskType"]) assert.ok(sql.includes(`- '${k}'`), k);
console.log("d31-fixes: ok");
