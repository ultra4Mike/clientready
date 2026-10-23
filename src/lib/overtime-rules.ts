/**
 * Account overtime rules (pure). Used only when the owner picks an overtime preset on Team > Timesheet rules;
 * the default ("worker") keeps each worker's own overtime setting (pay-types overtimePremium), unchanged.
 *  - federal: over 40 h in the Mon-Sun week at 1.5x.
 *  - california: over 8 h a day 1.5x, over 12 h a day 2x, 7th consecutive day in the week: first 8 h 1.5x, beyond 2x; weekly 40.
 *  - custom: the owner's daily OT / daily double-time / weekly / 7th-day values.
 * Premium is on top of straight time already paid: OT hours x 0.5 x regular rate, DT hours x 1.0 x regular rate.
 * Regular rate (FLSA) = (straight-time pay + non-discretionary bonus) / hours, when bonusInRegularRate is on.
 */
import type { TimesheetSettings } from "./timesheet";

export type OtRules = { weekly: number; daily: number; double: number; seventh: boolean };
export function otRules(s: Pick<TimesheetSettings, "otPreset" | "weeklyOtHours" | "dailyOtHours" | "dailyDtHours" | "seventhDayRule">): OtRules | null {
  if (s.otPreset === "federal") return { weekly: 40, daily: 0, double: 0, seventh: false };
  if (s.otPreset === "california") return { weekly: 40, daily: 8, double: 12, seventh: true };
  if (s.otPreset === "custom") return { weekly: s.weeklyOtHours || 0, daily: s.dailyOtHours || 0, double: s.dailyDtHours || 0, seventh: Boolean(s.seventhDayRule) };
  return null;
}

export type OtDay = { date: string; hours: number; straight: number };
export type OtDayResult = { date: string; otHours: number; dtHours: number; premium: number };

/** One Mon-Sun week of days (sorted by the caller or here). `weekBonus`: non-discretionary bonus dollars that week. */
export function overtimeTiers(days: OtDay[], rules: OtRules, weekBonus = 0): { days: OtDayResult[]; otHours: number; dtHours: number; premium: number; regularRate: number } {
  const list = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const totalH = list.reduce((s, d) => s + Math.max(0, d.hours), 0);
  const straight = list.reduce((s, d) => s + Math.max(0, d.straight), 0);
  const regularRate = totalH > 0 ? (straight + Math.max(0, weekBonus)) / totalH : 0;
  const worked = list.filter((d) => d.hours > 0);
  const seventhDate = rules.seventh && worked.length >= 7 ? worked[6].date : "";
  let weekRegular = 0;
  const out: OtDayResult[] = list.map((d) => {
    const h = Math.max(0, d.hours);
    let ot = 0, dt = 0;
    if (d.date === seventhDate) { dt = Math.max(0, h - 8); ot = h - dt; }
    else {
      dt = rules.double > 0 ? Math.max(0, h - rules.double) : 0;
      ot = rules.daily > 0 ? Math.max(0, h - rules.daily) - dt : 0;
    }
    let regular = h - ot - dt;
    if (rules.weekly > 0) {
      const over = Math.max(0, weekRegular + regular - Math.max(rules.weekly, weekRegular));
      regular -= over; ot += over;
    }
    weekRegular += regular;
    return { date: d.date, otHours: r2(ot), dtHours: r2(dt), premium: r2(ot * 0.5 * regularRate + dt * 1.0 * regularRate) };
  });
  return { days: out, otHours: r2(out.reduce((s, d) => s + d.otHours, 0)), dtHours: r2(out.reduce((s, d) => s + d.dtHours, 0)), premium: r2(out.reduce((s, d) => s + d.premium, 0)), regularRate };
}
const r2 = (n: number) => Math.round(n * 100) / 100;
