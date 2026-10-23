// Timesheet (allocateWeek), CSV export and Year view use the same resolved overtime rules: totals must agree for the same week.
import "./helpers/offline-env";
import { allocateWeek, ptoWeekOff, resolvedOvertime, type DayInput } from "@/lib/timesheet-pay";
import { DEFAULT_TIMESHEET_SETTINGS, CALIFORNIA_RULES, type TimesheetSettings } from "@/lib/timesheet";
import { timesheetCsv } from "@/lib/timesheet-csv";
import { mergePtoRequests } from "@/lib/pay-phase2";
import type { PtoRequest } from "@/lib/pay-phase2";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const wk = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const S = (p: Partial<TimesheetSettings>): TimesheetSettings => ({ ...DEFAULT_TIMESHEET_SETTINGS, ...p });
const RATE = 20;
const pto = (h: number, kind: "pto" | "sick" = "pto"): PtoRequest => ({ id: `p-${kind}`, employeeId: "e1", date: wk[0], hours: h, kind, note: "", status: "approved", createdAt: "" } as PtoRequest);

function compare(name: string, hours: number[], pay: unknown, settings: TimesheetSettings, reqs: PtoRequest[] = []) {
  const days: DayInput[] = hours.map((h, i) => ({ date: wk[i], approved: true, sheet: { paidMinutes: h * 60, driveMinutes: 0, jobs: [{ docId: "A", minutes: h * 60 }], drives: [] } as never }));
  const weekOff = ptoWeekOff(reqs, "e1");
  const sheet = allocateWeek(days, pay, String(RATE), { settings, weekOff });
  const tsHours = Math.round(sheet.reduce((s, d) => s + (d.otHours || 0) + (d.dtHours || 0), 0) * 100) / 100;
  const tsPremium = sheet.reduce((s, d) => s + (d.premiumCents || 0), 0) / 100;
  const tsTotal = sheet.reduce((s, d) => s + d.cents, 0) / 100;
  // Year view: crew rows (hours x rate) + resolved premium
  const entries = hours.map((h, i) => ({ date: wk[i], hours: h, rate: RATE })).filter((e) => e.hours > 0);
  const year = resolvedOvertime(entries, pay, { settings, weekOff });
  const yearTotal = entries.reduce((s, e) => s + e.hours * e.rate, 0) + year.premium;
  // CSV: clock entries 07:00 local + h hours
  const clock = hours.map((h, i) => h > 0 ? { id: `k${i}`, doc_id: "A", employee_id: "e1", worker_email: "", started_at: new Date(`${wk[i]}T07:00:00`).toISOString(), ended_at: new Date(new Date(`${wk[i]}T07:00:00`).getTime() + h * 3600000).toISOString() } : null).filter(Boolean) as never[];
  const { csv } = timesheetCsv(clock, wk[0], wk[6], { e1: "Sam" }, { A: { title: "Job", client: "C" } }, { e1: pay }, { settings, pto: reqs });
  const total = csv.split("\r\n").find((l) => l.startsWith("Sam,,Total"));
  if (process.env.DBG) console.log(csv);
  const csvOt = total ? Number(total.split(",")[8] || 0) : NaN;
  ok(Math.abs(tsHours - year.hours) < 0.01 && Math.abs(tsHours - csvOt) < 0.01 && Math.abs(tsPremium - year.premium) < 0.01 && Math.abs(tsTotal - yearTotal) < 0.01,
    `${name}: OT h timesheet ${tsHours} / CSV ${csvOt} / year ${year.hours}; total timesheet $${tsTotal} / year $${yearTotal}`);
}
const hourly = { type: "hourly" };
compare("account default 1.5x over 40", [10, 10, 10, 10, 10], hourly, S({}));
compare("account off, no worker OT", [10, 10, 10, 10, 10], hourly, S({ otPreset: "worker" }));
compare("legacy worker 2x over 40 on old account", [10, 10, 10, 10, 10], { type: "hourly", overtime: { on: true, weekly: "40", multiplier: "2" } }, S({ otPreset: "worker" }));
compare("override 1.25x over 38 + daily 8 / 2.5x after 10", [12, 9, 10, 8, 6], { type: "hourly", overtime: { on: true, override: true, weekly: "38", daily: "8", multiplier: "1.25", dtDaily: "10", dtMultiplier: "2.5" } }, S({}));
compare("California preset", [14, 9, 8, 8, 8, 4, 3], hourly, S(CALIFORNIA_RULES as Partial<TimesheetSettings>));
compare("PTO counted", [10, 10, 10, 6], hourly, S({ otCountPto: true }), [pto(8)]);
compare("PTO not counted", [10, 10, 10, 6], hourly, S({}), [pto(8)]);
compare("sick counted by worker override", [10, 10, 10, 6], { type: "hourly", overtime: { on: true, override: true, weekly: "40", multiplier: "1.5", countSick: true } }, S({}), [pto(8, "sick")]);

// Server + local PTO merge: server wins by id, local-only (not yet synced) kept.
const cloud = [{ ...pto(8), status: "approved" as const }];
const local = [{ ...pto(8), status: "pending" as const }, { ...pto(4), id: "local-only" }];
const merged = mergePtoRequests(cloud, local);
ok(merged.length === 2 && merged.find((r) => r.id === "p-pto")?.status === "approved" && merged.some((r) => r.id === "local-only"), "PTO merge: server wins, local-only kept");
ok(ptoWeekOff(merged, "e1").get(wk[0])?.pto === 12, "approved PTO from both sources counted for the week");
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
