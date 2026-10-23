// Overdue v2: payment-plan stages decide overdue; header Due date ignored when a plan exists.
import { invoicePastDue, overdueReason, effectiveDueDate, nextDueDate, isPastDue } from "@/lib/payments";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const stages = [
  { id: "d", label: "QA Deposit", kind: "deposit", mode: "amount", value: "300", dueDate: "2026-10-25" },
  { id: "p", label: "Progress", kind: "progress", mode: "amount", value: "400", dueDate: "2026-10-28" },
  { id: "f", label: "Final", kind: "final", mode: "amount", value: "300", dueDate: "2026-11-10" },
];
const inv1010 = { status: "sent", dueDate: "2026-10-19", stages, schedule: { date: "2026-10-25" } };
ok(!invoicePastDue(inv1010, 1000, 750, "2026-10-23"), "INV-1010 (old header 10/19, deposit $50 left due 10/25) is not overdue on 10/23");
ok(overdueReason(inv1010, 1000, 750, "2026-10-23") === "", "no reason when not overdue");
ok(invoicePastDue(inv1010, 1000, 750, "2026-10-26"), "deposit past due on 10/26 is overdue");
ok(overdueReason(inv1010, 1000, 750, "2026-10-26") === "QA Deposit $50.00 was due Oct 25", "reason names the stage: " + overdueReason(inv1010, 1000, 750, "2026-10-26"));
ok(!invoicePastDue(inv1010, 1000, 700, "2026-10-27"), "deposit fully paid, progress not due yet: not overdue");
ok(invoicePastDue(inv1010, 1000, 700, "2026-10-29"), "progress past due is overdue");
ok(effectiveDueDate(inv1010) === "2026-11-10" && nextDueDate(inv1010, 1000, 750, "2026-10-23") === "2026-10-25", "header due = last stage, next due = deposit");
const plain = { status: "sent", dueDate: "2026-10-19" };
ok(invoicePastDue(plain, 1000, 750, "2026-10-23") && overdueReason(plain, 1000, 750, "2026-10-23") === "Due date 2026-10-19 has passed", "no plan: invoice due date as before");
ok(!invoicePastDue({ ...plain, dueDate: "2026-10-30" }, 1000, 750, "2026-10-23"), "no plan, future due: not overdue");
ok(!invoicePastDue({ ...plain, status: "void" }, 1000, 750, "2026-10-23") && !invoicePastDue({ ...inv1010, status: "void" }, 1000, 750, "2026-11-30") && !isPastDue("voided", "2026-01-01", 5, "2026-10-23"), "void never overdue");
ok(!invoicePastDue({ ...inv1010, status: "draft" }, 1000, 750, "2026-11-30") && !invoicePastDue(inv1010, 1000, 0, "2026-11-30"), "draft / nothing owed never overdue");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
