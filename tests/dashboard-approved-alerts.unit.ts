// pt473u: approving a day on the Timesheet removes its no-show from Dashboard > Needs attention (same rule + labels).
import { readFileSync } from "node:fs";
import { timeAttention, type TimeWeek } from "@/lib/time-owner";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const day = "2026-10-23", now = "2026-10-23T23:00:00Z";
const job = { docId: "d1", start: "2026-10-23T14:00:00Z", end: "2026-10-23T16:00:00Z", label: "Job" };
const base = (approvals: TimeWeek["approvals"], fixes: TimeWeek["fixes"] = []): TimeWeek => ({
  week: "2026-10-19", days: [day], workers: [{ id: "a", name: "QA Bianca" }, { id: "b", name: "QA Devon" }] as never, events: [], fixes, approvals, settings: {} as never,
  sheets: new Map(), pays: new Map(), schedule: new Map([[`a|${day}`, [job]], [`b|${day}`, [job]]]),
});
let t = timeAttention(base([]), now);
ok(t.alerts.length === 2 && t.noShows === 2, "two unapproved no-shows show");
ok(t.alerts.every((a) => a.text === "No-show"), "label matches Timesheet (No-show when no hours)");
t = timeAttention(base([{ employeeId: "a", date: day, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: now }]), now);
ok(t.alerts.length === 1 && t.alerts[0].employeeId === "b" && t.noShows === 1, "approved day leaves the list and the count");
t = timeAttention(base([{ employeeId: "a", date: day, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: now }, { employeeId: "b", date: day, paidMinutes: 120, driveMinutes: 0, editedMinutes: null, approvedAt: now }]), now);
ok(t.alerts.length === 0 && t.noShows === 0, "all approved: card has nothing to flag");
t = timeAttention(base([{ employeeId: "a", date: day, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: now }], [{ id: "f", employeeId: "a", date: day, status: "pending" } as never]), now);
ok(t.alerts.some((a) => a.kind === "fix_pending" && a.employeeId === "a"), "pending fix request stays even on an approved day (same as Timesheet)");
ok(/useLiveRefresh\(/.test(readFileSync("src/components/timesheet/TimeAttentionCard.tsx", "utf8")), "card refreshes on focus/visible/online");
if (fails) { console.log(`${fails} failed`); process.exit(1); } else console.log("all passed");
