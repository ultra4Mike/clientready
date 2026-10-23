import "./helpers/test-setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalBadgeApplies } from "@/lib/approval";
import { displayStatus } from "@/lib/doc-status";
import { buildReport } from "@/lib/reports";

const pending = { status: "pending" } as never;
test("Awaiting approval only on proposals and change orders", () => {
  assert.equal(approvalBadgeApplies({ type: "invoice", data: {} }, pending), false);
  assert.equal(approvalBadgeApplies({ type: "proposal", data: {} }, pending), true);
  assert.equal(approvalBadgeApplies({ type: "invoice", data: { changeOrderOf: { id: "x", number: "INV-1" } } }, pending), true);
  assert.equal(approvalBadgeApplies({ type: "proposal", data: {} }, null), false);
});

const pay = (id: string, amount: number, date: string) => ({ id, amount: String(amount), method: "Card", date, ref: "" });
const inv3002 = { id: "i2", type: "invoice", createdAt: "2026-10-01", data: { invoiceNumber: "INV-3002", status: "sent", invoiceDate: "2026-10-01", items: [{ qty: "1", rate: "800" }], payments: [pay("stripe_d", 240, "2026-10-02"), pay("refund_d", -240, "2026-10-03")] } };
test("deposit refund reads Due · Refunded like the client page", () => {
  const shown = displayStatus(inv3002 as never, [inv3002] as never, "2026-10-05");
  assert.match(shown.label, /^(Due|Overdue) · Refunded \$240\.00$/);
});
test("Profit by job net = total minus refunds, profit unchanged", () => {
  const report = buildReport([inv3002] as never, [] as never, "2026");
  const job = report.jobs[0];
  assert.equal(job.total, 800);
  assert.equal(job.net, 560);
  assert.equal(Math.round(job.profit * 100), Math.round((job.net - job.cost) * 100)); // existing math: profit already nets refunds
});
