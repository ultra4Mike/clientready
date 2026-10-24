import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isBilledInvoice, isVoidOrDeleted, setAsideOf } from "../src/lib/ledger";
import { wasActuallySent } from "../src/lib/money";
import { manualSaveWarning, UNAPPROVE_WARNING, ADD_IN_APPROVED_WEEK_WARNING } from "../src/components/timesheet/DayDetail";
import { ownerZone } from "../src/lib/owner-zone";
import { liveChangeOrderNotes } from "../src/lib/change-orders";
import { hasMoneyRecords } from "../src/lib/void-invoice";
import { printPage, _resetPrintForTests } from "../src/lib/print-page";

let failed = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("ok", name); } catch (e) { failed++; console.error("FAIL", name, e); } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = (id: string, data: Record<string, unknown>, type = "invoice"): any => ({ id, type, createdAt: "2026-05-01", data });

t("void/deleted invoices are not billed", () => {
  assert.equal(isVoidOrDeleted(doc("a", { status: "void" })), true);
  assert.equal(isBilledInvoice(doc("a", { status: "void", items: [] }), []), false);
});
t("set-aside only on profit", () => { assert.equal(setAsideOf(-5, 25), 0); assert.equal(setAsideOf(100, 25), 25); });
t("auto-made invoice is not 'sent' until emailed", () => {
  assert.equal(wasActuallySent(doc("a", { autoConverted: true, status: "approved" })), false);
  assert.equal(wasActuallySent(doc("a", { autoConverted: true, sentAt: "2026-05-02" })), true);
  assert.equal(wasActuallySent(doc("a", { status: "sent" })), true);
});
t("manual time warning", () => {
  assert.equal(manualSaveWarning(true, true), UNAPPROVE_WARNING);
  assert.equal(manualSaveWarning(false, true), ADD_IN_APPROVED_WEEK_WARNING);
  assert.equal(manualSaveWarning(false, false), "");
});
t("owner zone falls back", () => { assert.equal(ownerZone("Not/AZone"), "America/Chicago"); assert.equal(ownerZone("America/New_York"), "America/New_York"); });
t("deleted change order notes hidden", () => {
  const notes = [{ id: "c1", number: "CO-1", createdAt: "" }, { id: "c2", number: "CO-2", createdAt: "" }];
  assert.deepEqual(liveChangeOrderNotes(notes, [doc("c1", {}), doc("c2", { deleted: true })]).map((n) => n.id), ["c1"]);
});
t("money records detected", () => { assert.equal(hasMoneyRecords(doc("a", { payments: [{ amount: 10 }] })), true); assert.equal(hasMoneyRecords(doc("a", {})), false); });
t("print ignores repeat taps", () => {
  _resetPrintForTests(); let n = 0; const timers: (() => void)[] = [];
  const win = { print: () => { n++; }, setTimeout: (fn: () => void) => { timers.push(fn); return 0; }, requestAnimationFrame: (fn: () => void) => { timers.push(fn); return 0; } } as never;
  printPage(win); printPage(win); for (let i = 0; i < 5 && timers.length; i++) timers.shift()!();
  assert.ok(n <= 1);
});
t("pay never shown to workers in crew preview", () => { assert.doesNotMatch(readFileSync("src/app/crew/page.tsx", "utf8"), /Clock in \(preview\)[^\n]*\$\{?price/); });
if (failed) { console.error(`${failed} failed`); process.exit(1); }
