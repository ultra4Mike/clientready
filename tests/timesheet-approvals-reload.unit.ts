// Approve → reload → no alert: approvals saved this session survive a slower in-flight load; resolved list per pay period;
// network errors read as plain words; static checks that the page waits for approvals before showing alerts.
import { readFileSync } from "node:fs";
import { splitAlerts, mergeApprovals, resolvedInPeriod } from "@/lib/timesheet-alerts";
import { friendlyError, OFFLINE_MESSAGE } from "@/lib/net-error";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const day = "2026-10-22";
const approvedRow: { employeeId: string; date: string; approvedAt: string | null } = { employeeId: "e2", date: day, approvedAt: "2026-10-23T19:00:00Z" };
const staleServer = [{ employeeId: "e2", date: day, approvedAt: null as string | null }];
const alert = [{ key: "no_show-e2", kind: "no_show", employeeId: "e2", date: day, text: "", open: "" }];
const isApproved = (rows: { employeeId: string; date: string; approvedAt?: string | null }[]) => (id: string, d: string) => Boolean(rows.find((a) => a.employeeId === id && a.date === d)?.approvedAt);
// The bug: a load that started before Approve resolved later with the old row and reopened the alert.
let merged = mergeApprovals(staleServer, [approvedRow]);
ok(splitAlerts(alert, isApproved(merged)).open.length === 0, "approve then stale load: alert stays resolved");
// Reload: server row now approved, nothing saved this session.
merged = mergeApprovals([approvedRow], []);
const s = splitAlerts(alert, isApproved(merged));
ok(s.open.length === 0 && s.resolved.length === 1, "after reload: no open alert, it is in Resolved");
// Unapprove in this session wins too.
merged = mergeApprovals([approvedRow], [{ ...approvedRow, approvedAt: null }]);
ok(splitAlerts(alert, isApproved(merged)).open.length === 1, "unapprove saved this session reopens the alert");
const period = { from: "2026-10-19", to: "2026-10-25" };
ok(resolvedInPeriod([{ date: "2026-10-22" }, { date: "2026-10-12" }], period).length === 1, "resolved older than the current pay period hides");
ok(friendlyError("Failed to fetch") === OFFLINE_MESSAGE && friendlyError("TypeError: Load failed") === OFFLINE_MESSAGE && friendlyError("Invalid login credentials") === "Invalid login credentials", "network errors read plainly; real errors unchanged");
const page = readFileSync("src/app/timesheet/page.tsx", "utf8");
ok(/const alerts = weekLoading \? \[\]/.test(page), "alerts wait for this week's approvals");
ok(/readLocalApprovals\(week/.test(page) && /mergeApprovals\(data\.approvals/.test(page), "local approvals seed the week; load merges saved-this-session rows");
ok(/key: `flag-\$\{r\.w\.id\}-\$\{d\.date\}`, employeeId: r\.w\.id, date: d\.date/.test(page), "needs-review alerts carry worker/day so approving moves them to Resolved");
ok(!page.includes("Resolved alerts (") && page.includes("They clear at the end of the pay period."), "one 'Resolved (n)' label with its explanation");
const ev = readFileSync("src/lib/day-events.ts", "utf8");
ok(/getSession\(\)/.test(ev.slice(ev.indexOf("export async function saveApprovals"))), "saveApprovals uses the session (a failed getUser fetch no longer skips the server write)");
ok(readFileSync("src/components/timesheet/ScheduleVsClock.tsx", "utf8").includes("scheduleAlertLabel("), "Scheduled vs clocked uses the shared label");
ok(readFileSync("src/app/login/page.tsx", "utf8").includes("friendlyError("), "login shows the plain network message");
if (fails) { console.log(`${fails} failed`); process.exit(1); } else console.log("all passed");
