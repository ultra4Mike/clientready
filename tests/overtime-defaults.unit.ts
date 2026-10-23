// Easy overtime: account default, worker override, CA tiers, custom multiplier/threshold, PTO counting, FLSA non-hourly.
import { allocateWeek, type DayInput } from "@/lib/timesheet-pay";
import { DEFAULT_TIMESHEET_SETTINGS, readTimesheetSettings, type TimesheetSettings } from "@/lib/timesheet";
import { multWords, otSummary, usesAccountOvertime } from "@/lib/overtime-rules";
import { OT_PRESETS, otEdit } from "@/components/timesheet/OvertimeRulesFields";
import { readPaySettings } from "@/lib/pay-types";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const tot = (d: { cents: number }[]) => d.reduce((s, x) => s + x.cents, 0);
const day = (date: string, hours: number): DayInput => ({ date, approved: true, sheet: { paidMinutes: hours * 60, driveMinutes: 0, jobs: [{ docId: "A", minutes: hours * 60 }], drives: [] } as never });
const wk = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const S = (p: Partial<TimesheetSettings>): TimesheetSettings => ({ ...DEFAULT_TIMESHEET_SETTINGS, ...p });
const hourly = { type: "hourly" } as const;
const five10 = wk.slice(0, 5).map((d) => day(d, 10)); // 50 h

// Defaults: new accounts ON (1.5x over 40); saved older rules without otPreset stay "worker"; FLSA non-hourly stays off.
ok(DEFAULT_TIMESHEET_SETTINGS.otPreset === "federal" && DEFAULT_TIMESHEET_SETTINGS.otMultiplier === 1.5, "new account default: overtime on, 1.5x");
ok(readTimesheetSettings({}).otPreset === "federal", "nothing saved -> default on");
ok(readTimesheetSettings({ gapMinutes: 60 }).otPreset === "worker", "older saved rules keep each worker's own setting");
ok(readTimesheetSettings({}).flsaNonHourly === false, "FLSA non-hourly stays off");
ok(readTimesheetSettings({}).otCountPto === false && readTimesheetSettings({}).otCountSick === false, "PTO counting off by default");

// Account default applies: $20/h, 50 h -> 10 OT h x $10 = $100
const acc = allocateWeek(five10, hourly, "20", { settings: S({}) });
ok(tot(acc) === 110000, `account default 1.5x over 40 (got ${tot(acc) / 100})`);
// Account off ("worker") + worker with no overtime -> none
ok(tot(allocateWeek(five10, hourly, "20", { settings: S({ otPreset: "worker" }) })) === 100000, "account off -> no OT");

// Override wins: worker 2x over 45 while account is 1.5x over 40 -> 5 h x $20 = $100
const ovr = allocateWeek(five10, { type: "hourly", overtime: { on: true, override: true, weekly: "45", multiplier: "2" } }, "20", { settings: S({}) });
ok(tot(ovr) === 110000 && ovr.reduce((s, d) => s + (d.otHours || 0), 0) === 5, `override wins (got ${tot(ovr) / 100})`);
// Override off but OT off on worker -> still account
ok(tot(allocateWeek(five10, { type: "hourly", overtime: { on: false, override: false } }, "20", { settings: S({}) })) === 110000, "use account rules");

// Existing custom values preserved: legacy worker (no override flag) on a "worker" account keeps his 2x over 40
const legacy = readPaySettings({ type: "hourly", overtime: { on: true, weekly: "40", multiplier: "2" } });
ok(legacy.overtime?.override === undefined && !usesAccountOvertime(legacy, "worker"), "legacy worker treated as override on old accounts");
ok(tot(allocateWeek(five10, legacy, "20", { settings: readTimesheetSettings({ gapMinutes: 60 }) })) === 120000, "legacy 2x pay unchanged ($1000 + 10 h x $20)");
// Legacy worker on an account that already had a preset keeps the account rule (as before)
ok(usesAccountOvertime(legacy, "federal"), "legacy worker on preset account keeps account rule");
ok(readPaySettings({ type: "hourly", overtime: { on: true, override: true } }).overtime?.override === true, "override flag survives read");

// CA tiers: one 14 h day = 4 h OT (8-12) + 2 h DT (12+) at $20: 4x10 + 2x20 = $80 premium
const ca = allocateWeek([day(wk[0], 14)], hourly, "20", { settings: S(OT_PRESETS.california as Partial<TimesheetSettings>) });
ok(tot(ca) === 28000 + 8000 && ca[0].otHours === 4 && ca[0].dtHours === 2, `California tiers (got ${tot(ca) / 100})`);

// 1.25x custom multiplier: 10 OT h x $20 x 0.25 = $50
const s125 = S(otEdit(S({}), { otMultiplier: 1.25 }) as Partial<TimesheetSettings>);
ok(s125.otPreset === "custom" && s125.weeklyOtHours === 40, "editing a preset becomes custom from its values");
ok(tot(allocateWeek(five10, hourly, "20", { settings: s125 })) === 105000, "1.25x multiplier");
ok(readTimesheetSettings({ otPreset: "custom", otMultiplier: 1.75 }).otMultiplier === 1.75, "any decimal multiplier kept");
// 38 h threshold: 40 h week -> 2 OT h x $10 = $20
const four10 = wk.slice(0, 4).map((d) => day(d, 10));
ok(tot(allocateWeek(four10, hourly, "20", { settings: S({ otPreset: "custom", weeklyOtHours: 38 }) })) === 82000, "38 h weekly threshold");
// Second tier: custom 1.5x over 8/day, 2.5x over 10/day; one 12 h day at $20: 2 h x 10 + 2 h x 30 = $80
ok(tot(allocateWeek([day(wk[0], 12)], hourly, "20", { settings: S({ otPreset: "custom", weeklyOtHours: 40, dailyOtHours: 8, dailyDtHours: 10, dtMultiplier: 2.5 }) })) === 24000 + 8000, "second tier with its own multiplier");
// Worker override second tier
ok(tot(allocateWeek([day(wk[0], 12)], { type: "hourly", overtime: { on: true, override: true, weekly: "40", daily: "8", multiplier: "1.5", dtDaily: "10", dtMultiplier: "2" } }, "20", { settings: S({}) })) === 24000 + 2000 + 4000, "worker override second tier");

// PTO counted vs not: 36 h worked + 8 h PTO. Not counted -> no OT; counted -> 4 OT h x $10 = $40 (PTO paid elsewhere at normal rate)
const w36 = [...wk.slice(0, 3).map((d) => day(d, 10)), day(wk[3], 6)];
const off = new Map([[wk[0], { pto: 8, sick: 0 }]]);
ok(tot(allocateWeek(w36, hourly, "20", { settings: S({}), weekOff: off })) === 72000, "PTO not counted (federal) -> no OT");
const counted = allocateWeek(w36, hourly, "20", { settings: S({ otCountPto: true }), weekOff: off });
ok(tot(counted) === 76000, `PTO counted -> 4 OT h (got ${tot(counted) / 100})`);
ok(tot(allocateWeek(w36, hourly, "20", { settings: S({ otCountSick: true }), weekOff: off })) === 72000, "sick switch doesn't count PTO");
ok(tot(allocateWeek(w36, { type: "hourly", overtime: { on: true, override: true, weekly: "40", multiplier: "1.5", countPto: true } }, "20", { settings: S({}), weekOff: off })) === 76000, "worker override counts PTO");

// FLSA non-hourly with custom multiplier/threshold: day rate $200 x 5 x 10 h = $1000, RR $20.
const day200 = { type: "day", dayRate: "200", dayHours: "10" } as const;
ok(tot(allocateWeek(five10, day200, "", { settings: S({ flsaNonHourly: true }) })) === 110000, "FLSA non-hourly 1.5x = 0.5 x RR");
ok(tot(allocateWeek(five10, day200, "", { settings: S({ flsaNonHourly: true, otPreset: "custom", weeklyOtHours: 44, otMultiplier: 1.25 }) })) === 100000 + 6 * 20 * 0.25 * 100, "FLSA non-hourly 1.25x over 44");
ok(tot(allocateWeek(five10, day200, "", { settings: S({ flsaNonHourly: false }) })) === 100000, "FLSA non-hourly off -> no premium");

// Plain words
ok(multWords(1.5) === "1.5x (time and a half)" && multWords(2) === "2x (double time)" && multWords(1.25) === "1.25x", "multiplier words");
ok(otSummary(S({})).includes("1.5x (time and a half) after 40 h a week"), "summary in plain words");
ok(otSummary(S({ otPreset: "worker" })).startsWith("Account overtime is off"), "summary when off");
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
