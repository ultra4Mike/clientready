// t516u (QA4 payroll): effective-dated rates, approval freeze, per-day rates, PTO rate, orphan PTO, categories.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addRaise, currentRate, rateOn } from "../src/lib/rate-history";
import { pickByDayRate } from "../src/lib/timesheet-sync";
import { orphanPtoPlan } from "../src/lib/phase2-data";
import { ptoDays } from "../src/lib/pay-phase2";
import { expensesByCategory } from "../src/lib/accountant-export";

const base = { id: "d", rate: "20", rateHistory: [] as never[] };
// 1. future raise: current pay unchanged, hours on/after the date get it
const future = addRaise(base, "25", "2026-11-01", "2026-10-24", "2026-10-24T10:00:00Z");
assert.equal(future.rate, "20");
assert.equal(rateOn(future, "2026-10-31"), "20");
assert.equal(rateOn(future, "2026-11-01"), "25");
assert.equal(currentRate(future, "2026-11-02"), "25");
// past-dated raise moves current pay, earlier hours keep the base
const past = addRaise(base, "22", "2026-10-20", "2026-10-24", "2026-10-24T10:00:00Z");
assert.equal(past.rate, "22");
assert.equal(rateOn(past, "2026-10-19"), "20");
assert.equal(past.rateHistory.length, 2);
// 2. freeze: an approved day ignores raises set after approval; unapprove (no asOf) releases it
assert.equal(rateOn(past, "2026-10-21", "2026-10-22T00:00:00Z"), "20");
assert.equal(rateOn(past, "2026-10-21", "2026-10-25T00:00:00Z"), "22");
assert.equal(rateOn(past, "2026-10-21"), "22");
// per-day rate pick
const run = (rate: string) => ["2026-10-19", "2026-10-21"].map((date) => ({ date, cents: Number(rate) * 100 }));
const picked = pickByDayRate([{ date: "2026-10-19" }, { date: "2026-10-21" }], new Map([["2026-10-19", "20"], ["2026-10-21", "22"]]), run);
assert.deepEqual(picked.map((d) => d.cents), [2000, 2200]);
// 5. PTO uses the dated rate (packet no longer $0.00)
const pto = ptoDays([{ id: "p", employeeId: "d", date: "2026-10-21", hours: 8, kind: "pto", note: "", status: "approved", createdAt: "" }], [past], "2026-01-01", "2026-12-31");
assert.equal(pto.get("d|2026-10-21")?.rate, "22");
assert.equal(pto.get("d|2026-10-21")?.cents, 17600);
// 3. orphan PTO cleanup: pending/denied removed, approved kept and counted
const plan = orphanPtoPlan([
  { id: "a", employeeId: "gone", status: "pending" }, { id: "b", employeeId: "", status: "denied" }, { id: "c", employeeId: "gone", status: "approved" }, { id: "e", employeeId: "d", status: "pending" },
] as never, new Set(["d"]));
assert.deepEqual(plan.remove, ["a", "b"]);
assert.equal(plan.keptApproved, 1);
// reports: categories merge case-insensitively
assert.deepEqual(expensesByCategory([["", "", "", "Dump Fee", "", "10"], ["", "", "", "Dump fee", "", "5"]]), [["Dump Fee", 15]]);
// soft delete: the Team page never hard-deletes; payroll/timesheet read every worker
const emp = readFileSync("src/app/employees/page.tsx", "utf8");
assert.ok(!/from\("employees"\)\.delete\(\)/.test(emp));
assert.ok(readFileSync("src/lib/time-owner.ts", "utf8").includes("readAllWorkers()"));
console.log("qa4-payroll ok");
