// Owner alerts: approved days resolved (not counted), reopened comes back; "No tap recorded" vs "No-show".
import { readFileSync } from "node:fs";
import { splitAlerts, scheduleAlertLabel } from "@/lib/timesheet-alerts";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const list = [
  { key: "a", kind: "no_show", employeeId: "e1", date: "2026-10-23", text: "", open: "" },
  { key: "b", kind: "no_show", employeeId: "e2", date: "2026-10-23", text: "", open: "" },
  { key: "c", employeeId: "e1", date: "2026-10-23", text: "fix", open: "", sticky: true },
];
const approved = new Set(["e1|2026-10-23"]);
let r = splitAlerts(list, (id, d) => approved.has(`${id}|${d}`));
ok(r.open.map((a) => a.key).join() === "b,c" && r.resolved.map((a) => a.key).join() === "a", "approved day leaves alerts (count excludes it), pending fix stays");
approved.clear(); r = splitAlerts(list, (id, d) => approved.has(`${id}|${d}`));
ok(r.open.length === 3 && r.resolved.length === 0, "unapproved / reopened day: alert comes back");
ok(scheduleAlertLabel("no_show", 60) === "No tap recorded", "paid from schedule, no tap: No tap recorded");
ok(scheduleAlertLabel("no_show", 0) === "No-show", "no hours at all: No-show");
ok(scheduleAlertLabel("late_start", 60) === "Late start", "late start unchanged");
const page = readFileSync("src/app/timesheet/page.tsx", "utf8");
ok(/splitAlerts\(allAlerts, \(id, date\) => Boolean\(approvalOf\(id, date\)\?\.approvedAt\)\)/.test(page), "page splits by the day's approval");
ok(/Alerts \(\{alerts\.length\}\)/.test(page) && /ts-alerts-resolved/.test(page), "count uses open alerts; Resolved section");
if (fails) { console.log(`${fails} failed`); process.exit(1); } else console.log("all passed");
