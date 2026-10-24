import assert from "node:assert/strict";
import { ptoApproveWarning } from "../src/lib/pay-phase2";
import { draftMoneyTaken } from "../src/lib/money";
import { isCostedJob } from "../src/lib/ledger";
import { withCrewExpenseCost } from "../src/lib/review";
import { donePrompt } from "../src/lib/done-prompt";
import { normTime, readSchedule } from "../src/lib/schedule";
import { mergeUnavailable, unavailableOn, unavailableWarning } from "../src/lib/unavailable";

let failed = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("ok", name); } catch (e) { failed++; console.error("FAIL", name, e); } };
const doc = (id: string, data: Record<string, unknown>, type = "invoice") => ({ id, type, title: "Job", data }) as never;

t("PTO over balance warns, holiday never", () => {
  assert.equal(ptoApproveWarning({ hours: 8 }, 8), "");
  assert.match(ptoApproveWarning({ hours: 16 }, 8), /Approve anyway/);
  assert.equal(ptoApproveWarning({ hours: 16, kind: "holiday" }, 0), "");
});
t("draft with a payment counts as money taken", () => {
  assert.equal(draftMoneyTaken(doc("a", { status: "draft" })), false);
  assert.equal(draftMoneyTaken(doc("a", { status: "paid" })), true);
  assert.equal(draftMoneyTaken(doc("a", { status: "draft", payments: [{ amount: 50, date: "2026-10-01" }] })), true);
});
t("costed jobs include drafts, not void", () => {
  assert.equal(isCostedJob(doc("a", { status: "draft" }), []), true);
  assert.equal(isCostedJob(doc("b", { status: "void" }), []), false);
});
t("crew expense adds one tagged cost row", () => {
  const once = withCrewExpenseCost({}, { key: "e1", amount: 25, costLabel: "Fuel" });
  const twice = withCrewExpenseCost(once, { key: "e1", amount: 25, costLabel: "Fuel" });
  const fees = (twice.jobCosts as { otherFees: { crewExpenseId: string }[] }).otherFees;
  assert.equal(fees.filter((f) => f.crewExpenseId === "e1").length, 1);
});
t("done prompt by state", () => {
  assert.equal(donePrompt(doc("a", { status: "draft" }))?.label, "Send invoice");
  assert.equal(donePrompt(doc("a", { status: "paid" })), null);
});
t("normTime and jobStart fallback", () => {
  assert.equal(normTime("9:00"), "09:00");
  assert.equal(normTime("09:00:00"), "09:00");
  assert.equal(normTime("nope"), "");
  assert.equal(readSchedule({ schedule: { date: "2026-10-26", workerIds: [] }, jobStart: "8:30" })?.startTime, "08:30");
});
t("time off ranges become days off and warn on assign", () => {
  const rows = mergeUnavailable([{ employee_id: "w1", day: "2026-10-26" }], [{ employee_id: "w2", start_date: "2026-10-26", end_date: "2026-10-28" }]);
  assert.equal(rows.filter((r) => r.employee_id === "w2").length, 3);
  assert.equal(unavailableOn(rows, "2026-10-27").has("w2"), true);
  assert.match(unavailableWarning(rows, "2026-10-26", ["w1", "w3"], new Map([["w1", "Ann"]])), /Ann/);
  assert.equal(unavailableWarning(rows, "2026-10-30", ["w1"], new Map()), "");
});
if (failed) { console.error(failed, "failed"); process.exit(1); }
