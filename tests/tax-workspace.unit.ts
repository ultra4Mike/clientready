import { incomeSplit, quarterPeriods, quarterlyEstimates, payrollSummary, scheduleC, salesTaxReport, uncategorized, yearEndChecklist, mileageDeduction } from "../src/lib/tax-workspace";
import { filterRows, sortRows, type Col } from "../src/lib/table-filter";
import { bizOccurrences, bizByLine, type BizExpense } from "../src/lib/business-expenses";

let failed = 0;
const ok = (c: unknown, m: string) => { if (!c) { failed++; console.log("FAIL", m); } };

// Quarterly due dates (2026: Apr 15 Wed, Jun 15 Mon, Sep 15 Tue, Jan 15 2027 Fri); 2028-04-15 is a Saturday -> Monday 17.
ok(JSON.stringify(quarterPeriods("2026").map((q) => q.due)) === '["2026-04-15","2026-06-15","2026-09-15","2027-01-15"]', "1040-ES due dates");
ok(quarterPeriods("2028")[0].due === "2028-04-17", "weekend due date moves to Monday");
const q = quarterlyEstimates([{ kind: "in", date: "2026-02-01", amount: 1000 }, { kind: "out", date: "2026-02-02", amount: 200 }, { kind: "pay", date: "2026-07-01", amount: 300 }], "2026", 25);
ok(q[0].profit === 800 && q[0].setAside === 200 && q[2].setAside === 0 && q[2].profit === -300, "quarter profit and set-aside (no set-aside on a loss)");

// Payroll: contractor at $600 is a 1099-NEC candidate, $599 is not; W-2 totals separate.
const p = payrollSummary([{ kind: "pay", worker: "A", workerKind: "contractor", amount: 600 }, { kind: "pay", worker: "B", workerKind: "contractor", amount: 599 }, { kind: "pay", worker: "C", workerKind: "employee", amount: 1000, hours: "10" }, { kind: "in", amount: 5000 }], []);
ok(p.nec.length === 1 && p.nec[0].name === "A" && p.contractorTotal === 1199 && p.w2Total === 1000 && p.w2Count === 1, "1099-NEC $600 threshold and W-2 totals");

// Income split: refunds and proposal deposits kept apart.
const docs = [
  { id: "i1", type: "invoice", data: { status: "paid", payments: [{ date: "2026-03-01", amount: "500" }] } },
  { id: "p1", type: "proposal", data: { status: "accepted", payments: [{ date: "2026-03-02", amount: "100" }] } },
];
const inc = incomeSplit(docs as never, "2026");
ok(inc.deposits <= inc.gross && inc.net === Math.round((inc.gross - inc.refunds) * 100) / 100, "income split adds up");

// Schedule C: Line 28 = job costs + business, Line 31 = Line 7 - Line 28; untracked lines are null, never 0.
const sc = scheduleC({ income: { payments: 1000, deposits: 0, refunds: 100, gross: 1000, net: 900 }, tax: { lines: [{ key: "supplies", line: "Line 22", label: "Supplies", amount: 200 }], total: 200, tips: 0 }, miles: { miles: 0, amount: 0 }, biz: [{ line: "Line 15", amount: 50 }, { line: "Line 22", amount: 10 }] });
const L = (l: string) => sc.find((r) => r.line === l);
ok(L("Line 3")?.amount === 900 && L("Line 28")?.amount === 260 && L("Line 31")?.amount === 640, "Schedule C totals");
ok(L("Line 22")?.amount === 210 && L("Line 15")?.amount === 50, "business expenses land on their lines");
ok(L("Line 4")?.amount === null && L("Line 26")?.amount === null && L("Line 30")?.amount === null, "untracked lines say not tracked");
const lines = sc.filter((r) => /^Line \d/.test(r.line)).map((r) => r.line);
ok(lines.indexOf("Line 15") < lines.indexOf("Line 22"), "lines in form order");

// Sales tax: by month from invoice rows (col 0 date, 7 tax, 8 total).
const st = salesTaxReport([["2026-02-10", "", "", "", "", "", "", "8.00", "108.00"], ["2026-02-11", "", "", "", "", "", "", "0", "50"]]);
ok(st.total === 8 && st.invoices === 1 && st.months[1].taxable === 100, "sales tax report");

ok(uncategorized([["2026-01-01", "INV-1", "Al", "Other fee", "Line 27a", "5", "Job costs"]], [["2026-01-02", "INV-1", "Hal", "Other", "7", ""]]).length === 2, "uncategorized list");
const ck = yearEndChecklist({ businessName: "Biz", taxId: "", uncategorized: 1, crewReceipts: 0, crewMissingPhoto: 0, miles: 0, nec: 0, unpaid: 2, unpaidTotal: 50 });
ok(ck.length === 6 && ck.every((c) => c.href.startsWith("/")) && ck.find((c) => c.key === "business")?.done === false && ck.find((c) => c.key === "receipts")?.done === null, "checklist links and not-tracked state");
ok(mileageDeduction([{ id: "t", date: "2026-03-01", miles: "10", from: "", to: "", purpose: "" }] as never, "2026").amount === 7.25, "mileage at the 2026 IRS rate");

// Table filters
type R = { d: string; c: string; m: string; a: number };
const cols: Col<R>[] = [{ key: "date", label: "Date", type: "date", value: (r) => r.d }, { key: "client", label: "Client", value: (r) => r.c, filter: true }, { key: "method", label: "Method", value: (r) => r.m, filter: true }, { key: "amount", label: "Amount", type: "money", value: (r) => r.a }];
const rows: R[] = [{ d: "2026-01-05", c: "Ann", m: "Cash", a: 10 }, { d: "2026-02-05", c: "Bob", m: "Card", a: 30 }, { d: "2026-03-05", c: "Ann", m: "Card", a: 20 }];
ok(filterRows(rows, cols, { from: "2026-02-01", to: "", q: "", pick: {} }).length === 2, "date range filter");
ok(filterRows(rows, cols, { from: "", to: "", q: "", pick: { client: "Ann", method: "Card" } }).length === 1, "client + method filter");
ok(filterRows(rows, cols, { from: "", to: "", q: "bob", pick: {} }).length === 1, "search");
ok(sortRows(rows, cols, { key: "amount", dir: "desc" }).map((r) => r.a).join() === "30,20,10", "money sort");

// Business expenses: monthly repeats, month-end clamp, stops at today / end date.
const list: BizExpense[] = [
  { id: "r", date: "2026-01-31", vendor: "Landlord", amount: "100", category: "rent", method: "Bank", note: "", monthly: true },
  { id: "o", date: "2026-05-02", vendor: "Staples", amount: "12.5", category: "office", method: "Card", note: "" },
  { id: "x", date: "2025-12-01", vendor: "Old", amount: "9", category: "office", method: "Card", note: "" },
];
const occ = bizOccurrences(list, "2026", "2026-04-15");
ok(occ.filter((o) => o.entryId === "r").map((o) => o.date).join() === "2026-01-31,2026-02-28,2026-03-31", "monthly to today, clamped to month end");
ok(occ.some((o) => o.entryId === "o") && !occ.some((o) => o.entryId === "x"), "one-off entries kept as dated; other years excluded");
ok(bizOccurrences([{ ...list[0], until: "2026-02-15" }], "2026", "2026-12-31").length === 1, "monthly stops at end date");
ok(bizByLine(bizOccurrences(list, "2026", "2026-12-31")).reduce((s, l) => s + l.amount, 0) === 1212.5, "totals by line");

console.log(failed ? `${failed} failed` : "all passed");
if (failed) process.exit(1);
