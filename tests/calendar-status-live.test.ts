/** Help live check (calendar + documents on 332b313): one shared status helper for every view. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { approvalBadgeApplies } from "@/lib/approval";
import { approvalOf, isTentative, PRESETS, PRESET_LABEL, visibleOnCalendar } from "@/lib/calendar-filter";
import { belongsInUnscheduled, displayStatus, isDueInvoice, jobMessageKind, jobRowLabel, needsApproval, rowStage } from "@/lib/doc-status";
import { nextFreeNumber, numberForKind } from "@/lib/doc-numbers";
import { missingDeposits, depositInvoice } from "@/lib/proposal-deposit";
import { totalText } from "@/components/views/DocumentsListView";

const sched = { date: "2026-10-25", startTime: "09:00", workerIds: [], status: "scheduled", updatedAt: "" };
const item = (rate: number) => [{ qty: "1", rate: String(rate) }];
const pay = (id: string, amount: number, date: string) => ({ id, amount: String(amount), method: "Cash", date, ref: "" });

test("1) plain draft invoice never gets NOT APPROVED; unapproved proposal / pending change order do", () => {
  const inv1032 = { id: "a", type: "invoice", data: { invoiceNumber: "INV-1032", status: "draft", items: item(100), schedule: { ...sched, status: "done", confirmedAt: "x" } } };
  assert.equal(isTentative(inv1032), false);
  assert.equal(needsApproval({ id: "p", type: "proposal", data: { status: "sent" } }), true);
  const co = { id: "c", type: "invoice", data: { status: "sent", changeOrderOf: { id: "x", number: "INV-1" }, approval: { status: "pending" } } };
  assert.equal(isTentative(co), true);
  assert.equal(isTentative({ ...co, data: { ...co.data, approval: { status: "approved" } } }), false); // 7) approved CO
});

test("2) a proposal with a live invoice is hidden (also from Proposals only); a void invoice doesn't count", () => {
  const prop = { id: "p5", type: "proposal", data: { invoiceNumber: "PROP-1005", status: "accepted", schedule: sched } };
  const inv = { id: "i19", type: "invoice", data: { status: "paid", fromProposal: { id: "p5" }, items: item(10) } };
  assert.equal(visibleOnCalendar(prop, PRESETS.proposals, [prop, inv]), false);
  assert.equal(visibleOnCalendar(prop, PRESETS.all, [prop, inv]), false);
  const onlyVoid = { ...inv, data: { ...inv.data, status: "void" } };
  assert.equal(visibleOnCalendar(prop, PRESETS.proposals, [prop, onlyVoid]), true);
});

test("3) void wins: label Void, not Paid filter/due, hidden from calendar, never Unscheduled", () => {
  const v = { id: "v", type: "invoice", data: { status: "void", items: item(100), payments: [pay("x", 100, "2026-10-01")], schedule: sched, dueDate: "2026-10-25" } };
  assert.equal(displayStatus(v as never).label, "Void");
  assert.equal(isDueInvoice(v), false);
  assert.equal(visibleOnCalendar(v, PRESETS.all, [v]), false);
  assert.equal(belongsInUnscheduled(v, [v], false), false);
  assert.equal(rowStage(v, [v]).void, true);
  assert.equal(jobRowLabel(v, [v], "Scheduled"), "Void");
});

test("4) proposals never get an INV- number", () => {
  const docs = [{ id: "1", type: "proposal", data: { invoiceNumber: "PROP-1004" } }, { id: "2", type: "invoice", data: { invoiceNumber: "INV-1021" } }];
  assert.equal(nextFreeNumber(docs, "proposal", "INV-1021"), "PROP-1005");
  assert.equal(numberForKind(docs, "proposal", "INV-1022", "draft"), "PROP-1005");
  assert.equal(numberForKind(docs, "proposal", "INV-1022", "sent"), "INV-1022"); // never renumber a sent doc
  assert.equal(numberForKind(docs, "proposal", "Q-7", "draft"), "Q-7");
});

test("5) footer job message is status-correct", () => {
  assert.equal(jobMessageKind("void", "scheduled"), "");
  assert.equal(jobMessageKind("paid", "scheduled"), "complete");
  assert.equal(jobMessageKind("sent", "scheduled"), "scheduled");
});

test("6) filters + list + month Due", () => {
  assert.equal(PRESET_LABEL.drafts, "Unsent drafts");
  const sentProp = { id: "p", type: "proposal", data: { status: "sent", approval: { status: "pending" } } };
  assert.equal(approvalOf(sentProp), "pending");
  assert.equal(visibleOnCalendar(sentProp, PRESETS.drafts), false);
  const draftInv = { id: "d", type: "invoice", data: { status: "draft" } };
  assert.equal(visibleOnCalendar(draftInv, PRESETS.drafts), true);
  const paid = { id: "pd", type: "invoice", data: { status: "paid", items: item(50), payments: [pay("a", 50, "2026-10-01")] } };
  assert.equal(isDueInvoice(paid), false);
  assert.match(jobRowLabel(paid, [paid], "Scheduled"), /^Paid · Job scheduled$/);
});

test("7) change order totals are shown (credits too)", () => {
  const co = { type: "invoice", data: { changeOrderOf: { id: "x" } } };
  assert.equal(totalText(co, -45), "-$45.00");
  assert.equal(totalText(co, 0), "$0.00");
  assert.equal(totalText({ type: "invoice", data: {} }, 120), "$120.00");
});

test("8) overdue invoice: stage/next agree with Overdue, no Approved-on badge on plain invoices", () => {
  const inv = { id: "o", type: "invoice", data: { status: "sent", dueDate: "2026-10-01", items: item(200), schedule: sched, approval: { status: "approved" }, fromProposal: { id: "p" } } };
  assert.equal(displayStatus(inv as never, [], "2026-10-20").key, "overdue");
  const r = rowStage(inv, [], "2026-10-20");
  assert.equal(r.stage, "invoiced");
  assert.equal(r.next, "collect-payment");
  assert.equal(approvalBadgeApplies(inv, { status: "approved", createdAt: "" }), false);
});

test("9) a deposit is never carried twice (new id / timestamp date), two real $100 stay two, void copy never carries", () => {
  const proposal = [pay("d1", 100, "2026-10-21")];
  assert.deepEqual(missingDeposits(proposal, [pay("srv-1", 100, "2026-10-21T07:22:27Z")]), []);
  assert.equal(missingDeposits([pay("d1", 100, "2026-10-21"), pay("d2", 100, "2026-10-21")], [pay("d1", 100, "2026-10-21")]).length, 1);
  const docs = [{ id: "v", type: "invoice", data: { status: "void", fromProposal: { id: "P", depositApplied: true } } }, { id: "r", type: "invoice", data: { status: "paid", fromProposal: { id: "P" } } }];
  assert.equal(depositInvoice(docs, "P")?.id, "r");
});
