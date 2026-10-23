// Help check: FLSA non-hourly overtime recomputed from the app's pay engine (allocateWeek).
// Piece $250 over 50 h, min wage $10, FLSA on -> top-up $250, regular rate $500/50 = $10, 10 OT hours.
// Premium = (multiplier - 1) x regular rate x OT hours: 1.5x -> $50, 2x -> $100.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateWeek, type DayInput } from "@/lib/timesheet-pay";
import { DEFAULT_TIMESHEET_SETTINGS, type TimesheetSettings } from "@/lib/timesheet";
import { OT_PRESETS, otEdit } from "@/components/timesheet/OvertimeRulesFields";

const wk = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const day = (date: string, hours: number): DayInput => ({
  date, approved: true, sheet: { paidMinutes: hours * 60, driveMinutes: 0, jobs: [{ docId: "A", minutes: hours * 60 }], drives: [] } as never });
// Same path as the Settings > Overtime card: "US standard" shortcut, then (for 2x) picking Double time, which turns it Custom via otEdit.
function run(otMultiplier: number) {
  let s = { ...DEFAULT_TIMESHEET_SETTINGS, ...OT_PRESETS.us, flsaNonHourly: true, minWage: 10 } as TimesheetSettings;
  if (otMultiplier !== 1.5) s = { ...s, ...otEdit(s, { otMultiplier }) } as TimesheetSettings;
  const settings = s as never;
  const out = allocateWeek(wk.map((d) => day(d, 10)), { type: "piece", pieceRate: "10" }, "", { settings, weekExtra: new Map([[wk[0], 250]]) });
  return { premium: out.reduce((s, d) => s + (d.premiumCents || 0), 0), topUp: out.reduce((s, d) => s + (d.topUpCents || 0), 0) };
}
test("FLSA non-hourly 1.5x: $250 piece, 50 h, min wage $10 -> $50 premium", () => {
  const r = run(1.5);
  assert.equal(r.topUp, 25000);
  assert.equal(r.premium, 5000);
});
test("FLSA non-hourly 2.0x: same week -> $100 premium", () => {
  const r = run(2);
  assert.equal(r.topUp, 25000);
  assert.equal(r.premium, 10000);
});
