import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicApproval, publicDocData, publicEventLabel, publicHistory } from "../src/lib/portal-safe";
import { portalTimeline } from "../src/lib/portal-timeline";

const ownerId = "11111111-2222-3333-4444-555555555555";
const history = [
  { at: "2026-10-24T03:29:00.000Z", by: "Pat Owner", byId: ownerId, action: "Approved by phone", note: "John said ok, gate code 1234" },
  { at: "2026-10-24T03:31:00.000Z", by: "Pat Owner", byId: ownerId, action: "Approval undone by owner", note: "wrong job" },
  { at: "2026-10-24T03:32:00.000Z", by: "Pat Owner", byId: ownerId, action: "Something internal" },
  { bad: 1 }, "x",
];
const h = publicHistory(history);
assert.deepEqual(h, [{ at: "2026-10-24T03:29:00.000Z", event: "approved_by_phone" }, { at: "2026-10-24T03:31:00.000Z", event: "approval_undone" }]);
assert.deepEqual(publicHistory(h), h, "idempotent on already-sanitized server output");
assert.deepEqual(publicHistory(null), []);

const approval = { status: "approved", createdAt: "c", approvedAt: "2026-10-24T03:29:00.000Z", method: "phone", approvedBy: "Pat Owner", markedBy: "Pat Owner", approverName: "Pat Owner (by phone)", note: "internal", token: "secret-token" };
const pa = publicApproval(approval)!;
assert.deepEqual(Object.keys(pa).sort(), ["approvedAt", "createdAt", "method", "status"]);
const client = publicApproval({ status: "approved", createdAt: "c", approvedAt: "a", approverName: "John Client", token: "t" })!;
assert.equal(client.approverName, "John Client", "client's own online approval keeps the client's name");
assert.equal(client.token, undefined);

const data = publicDocData({ invoiceNumber: "INV-1022", approval, history });
const text = JSON.stringify(data);
for (const leak of [ownerId, "Pat Owner", "gate code", "wrong job", "internal", "secret-token", "byId", "Something internal"]) assert.ok(!text.includes(leak), `leaked ${leak}`);

assert.equal(publicEventLabel("approved_by_phone", "Ridge Line Yard Co"), "Approved by phone (recorded by Ridge Line Yard Co)");
const tl = portalTimeline([{ id: "d", type: "invoice", title: "I", data, total: 10, owed: 10 }], "2026-10-24", "Ridge Line Yard Co");
assert.ok(tl.some((i) => i.kind === "approved" && i.title === "Invoice INV-1022 approved by phone (recorded by Ridge Line Yard Co)"));
assert.ok(!JSON.stringify(tl).includes("Pat"));

// The SQL boundary covers the same keys and installs the append-only trigger.
const sql = readFileSync("supabase/migrations/20261104100000_history_public_append_only.sql", "utf8");
for (const k of ["'token'", "'note'", "'markedBy'", "'approvedBy'", "'approverName'", "public_history_data", "documents_history_append_only", "get_document_by_approval_token"]) assert.ok(sql.includes(k), `migration missing ${k}`);
console.log("portal-history-sanitize: ok");
