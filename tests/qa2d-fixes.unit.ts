import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { displayStatus, effectiveDocStatus } from "../src/lib/doc-status";
import { documentStage, docAmounts } from "../src/lib/doc-stage";
import { billedOutstanding, cashCollected } from "../src/lib/money";
import { quarterlyEstimates } from "../src/lib/tax-workspace";
import { approvalBadgeApplies } from "../src/lib/approval";
import { setAsideCopy } from "../src/lib/profit-alerts";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 2. INV-1019: status box "paid" but $208.24 still owed -> not Paid anywhere.
const owing = { id: "i19", type: "invoice", createdAt: "2026-10-01", data: { status: "paid", invoiceNumber: "INV-1019", invoiceDate: "2026-10-01", taxPercent: "0", items: [{ description: "Job", qty: "1", rate: "408.24" }], payments: [{ id: "p1", amount: "200", method: "Cash", date: "2026-10-02" }] } };
assert.notEqual(documentStage(owing as never).stage, "paid");
assert.notEqual(displayStatus(owing as never, [owing] as never).key, "paid");
assert.equal(effectiveDocStatus(owing, [owing]), "sent");
// Old "paid" invoices with no payment rows are still Paid (balance treats them as paid).
const oldPaid = { id: "i2", type: "invoice", data: { status: "paid", items: [{ description: "x", qty: "1", rate: "50" }] } };
assert.equal(documentStage(oldPaid as never).stage, "paid");

// 4. Dashboard total = all lines (100 + 50), not the first line.
const two = { id: "d", type: "invoice", data: { items: [{ description: "a", qty: "1", rate: "100" }, { description: "b", qty: "1", rate: "50" }] } };
assert.equal(docAmounts(two as never).total, 150);
const dash = src("src/app/dashboard/page.tsx");
assert.match(dash, /return docAmounts\(doc as never\)\.total;/);
assert.match(dash, /data-testid="recent-total"/);
assert.match(dash, /displayStatus\(doc as never, documents as never\)\.label/);

// 3. Reports: owed count from the same loop as the owed total; quarters use cashCollected.
const docs = [owing, { id: "i3", type: "invoice", createdAt: "2026-10-05", data: { status: "draft", invoiceDate: "2026-10-05", items: [{ description: "y", qty: "1", rate: "100" }], payments: [{ id: "q", amount: "100", date: "2026-10-06" }] } }];
const b = billedOutstanding(docs as never, "2026-01-01", "2026-12-31");
assert.equal(b.owedCount, b.outstanding > 0 ? 1 : 0);
const q = quarterlyEstimates([], "2026", 30, (f, t) => cashCollected(docs as never, f, t));
assert.equal(q[3].collected, cashCollected(docs as never, "2026-10-01", "2026-12-31"));
const rep = src("src/app/reports/page.tsx");
assert.match(rep, /count: b\.owedCount/);
assert.match(rep, /periodSummary\(documents as never, bizOcc, p\.from, p\.to/); // QA3: quarters come from the shared ledger

// 1. Document filters use the derived status.
const list = src("src/components/views/DocumentsListView.tsx");
assert.match(list, /const status = effectiveDocStatus\(doc, documents\);/);
assert.match(list, /shown === "paid"/);
assert.match(list, /statusFilter === "draft"/);

// 6. PROP-1010: an invoiced proposal never shows "Awaiting approval".
const prop = { id: "pr", type: "proposal", data: { status: "sent" } };
const pending = { status: "pending" } as never;
assert.ok(approvalBadgeApplies(prop, pending));
assert.ok(!approvalBadgeApplies(prop, pending, [{ type: "invoice", data: { fromProposal: { id: "pr" } } }]));
assert.ok(!approvalBadgeApplies({ ...prop, data: { status: "invoiced" } }, pending));

// 5. Expenses can be edited.
assert.match(src("src/components/reports/BusinessExpenses.tsx"), /data-testid="biz-edit"/);

// 7. Set-aside copy follows the saved value; 30 is the real default.
assert.match(setAsideCopy("5"), /set aside 5% of profit; new accounts start at 30%/);
assert.match(setAsideCopy(""), /30% of profit \(the default\)/);
assert.doesNotMatch(src("src/app/profile/page.tsx"), /Default is 30%\./);

// 8. Manual time entry on an approved day asks first.
assert.match(src("src/components/timesheet/DayDetail.tsx"), /const warn = manualSaveWarning\(approved, Boolean\(props\.weekHasApproved\)\); if \(warn && !window\.confirm\(warn\)\) return;/);
console.log("qa2d-fixes ok");
