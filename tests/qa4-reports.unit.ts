// t516u (QA4 reports): one labour number, Devon legacy day, stock on save, collected <= billed, removed_at SQL.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jobLabour, labourReconcile } from "../src/lib/job-profit";
import { legacyDayCents } from "../src/lib/timesheet-sync";
import { labourRowHours } from "../src/lib/pay-types";
import { commitStock, type Part } from "../src/lib/inventory";
import { payrollByPeriod } from "../src/lib/tax-workspace";

// Devon: a day before the timesheet pay cutover. Job row = 5h x $22 = $110; the clock said 6h ($132).
const devonRow = { employeeId: "devon", workDate: "2026-10-20", hours: "5", rate: "22" };
const docs = [{ id: "i1", type: "invoice", data: { status: "sent", invoiceDate: "2026-10-20", crew: [devonRow] } }];
assert.equal(legacyDayCents(docs as never, "devon", "2026-10-20"), 11000); // payroll uses the job row, not 6h x 22
assert.equal(jobLabour(docs[0].data as never), 110); // the same number as Line 11 / Profit by job
assert.equal(legacyDayCents(docs as never, "devon", "2026-10-21"), null);
// payroll reconciles: $110 job labour + $44 PTO + $11 OT premium = $165
assert.deepEqual(labourReconcile({ payroll: 165, jobLabour: 110, pto: 44, otPremium: 11 }), { expected: 165, gap: 0, ok: true });
assert.equal(labourReconcile({ payroll: 187, jobLabour: 110, pto: 44, otPremium: 11 }).gap, 22); // the old $132-vs-$110 gap shows
assert.equal(jobLabour({ crew: [], jobCosts: { labor: "80" } }), 80); // no crew: the labor box
// Payroll hours: a timesheet-paid row shows its timesheet hours (not 0)
assert.equal(labourRowHours({ paySource: "timesheet", timesheetMinutes: 330, hours: "" } as never), 5.5);
// pay periods group pay rows
const per = payrollByPeriod([{ kind: "pay", date: "2026-10-20", hours: "5", amount: 110, worker: "Devon" }, { kind: "pay", date: "2026-10-27", hours: "2", amount: 44, worker: "Devon" }] as never, (d) => d < "2026-10-26" ? { from: "2026-10-12", to: "2026-10-25" } : { from: "2026-10-26", to: "2026-11-08" });
assert.deepEqual(per.map((p) => p.total), [44, 110]);

// Inventory: a pending line leaves stock only when committed (invoice saved), once.
let parts: Part[] = [{ id: "p1", name: "Chlorine", qty: "10" } as Part];
const store = { read: () => parts, upsert: (part: Part) => (parts = parts.map((p) => (p.id === part.id ? part : p))) };
const pending = [{ partId: "p1", qty: 3, applied: false }];
assert.equal(parts[0].qty, "10"); // added to the form: stock unchanged (Clear form leaves it at 10)
const saved = commitStock(pending, store);
assert.equal(parts[0].qty, "7");
commitStock(saved, store); // saving again does not take it twice
assert.equal(parts[0].qty, "7");

// Source checks: one job-costs set in reports months, Schedule C labour via jobLabour, collected clamp, still-owed card.
const reports = readFileSync("src/lib/reports.ts", "utf8");
assert.match(reports, /if \(isCostedJob\(doc as never, docs as never\)\) months\[when\.month\]\.jobCosts/);
assert.match(readFileSync("src/lib/tax-categories.ts", "utf8"), /sums\.labor \+= jobLabour\(data\)/);
assert.match(readFileSync("src/lib/best-customers.ts", "utf8"), /collected: r2\(Math\.min\(row\.collected, row\.billed\)\)/);
assert.match(readFileSync("src/app/collect/page.tsx", "utf8"), /billedOutstanding\(documents as never\)\.outstanding/);
// removed_at: SQL file, code with fallback
const emp = readFileSync("src/app/employees/page.tsx", "utf8");
assert.match(emp, /removed_at: person\.removedAt/);
assert.match(emp, /\/removed_at\/i\.test/);
console.log("ok qa4 reports: one labour number, Devon $110 legacy, stock on save, collected <= billed, removed_at fallback");
