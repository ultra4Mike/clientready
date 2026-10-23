/**
 * Account overtime rules (pure). New accounts start on "federal" (1.5x over 40 h).
 * "worker" (account overtime off; older accounts) keeps each worker's own setting (pay-types overtimePremium). A worker
 * with "Override" on (Team > edit) always uses his own setting; see usesAccountOvertime.
 *  - federal: over 40 h in the Mon-Sun week at 1.5x.
 *  - california: over 8 h a day 1.5x, over 12 h a day 2x, 7th consecutive day in the week: first 8 h 1.5x, beyond 2x; weekly 40.
 *  - custom: the owner's daily OT / daily double-time / weekly / 7th-day values.
 * Premium is on top of straight time already paid: OT hours x (mult - 1) x regular rate, DT hours x (dtMult - 1) x regular rate (1.5 / 2 by default).
 * Regular rate (FLSA) = (straight-time pay + non-discretionary bonus) / hours, when bonusInRegularRate is on.
 */
import type { TimesheetSettings } from "./timesheet";

/** mult / dtMult: pay multipliers (1.5 = time and a half, 2 = double time). Missing = 1.5 / 2. */
export type OtRules = { weekly: number; daily: number; double: number; seventh: boolean; mult?: number; dtMult?: number };
type OtSettings = Pick<TimesheetSettings, "otPreset" | "weeklyOtHours" | "dailyOtHours" | "dailyDtHours" | "seventhDayRule"> & Partial<Pick<TimesheetSettings, "otMultiplier" | "dtMultiplier">>;
export function otRules(s: OtSettings): OtRules | null {
  if (s.otPreset === "federal") return { weekly: 40, daily: 0, double: 0, seventh: false, mult: 1.5, dtMult: 2 };
  if (s.otPreset === "california") return { weekly: 40, daily: 8, double: 12, seventh: true, mult: 1.5, dtMult: 2 };
  if (s.otPreset === "custom") return { weekly: s.weeklyOtHours || 0, daily: s.dailyOtHours || 0, double: s.dailyDtHours || 0, seventh: Boolean(s.seventhDayRule), mult: s.otMultiplier || 1.5, dtMult: s.dtMultiplier || 2 };
  return null;
}

/** Plain words for a multiplier: 1.5 -> "1.5x (time and a half)", 2 -> "2x (double time)", else "1.75x". */
export function multWords(m: number | string | undefined) {
  const n = Math.round((Number(m) || 1.5) * 100) / 100;
  return n === 1.5 ? "1.5x (time and a half)" : n === 2 ? "2x (double time)" : n === 1 ? "1x (straight time, no extra)" : `${n}x`;
}

/** Whose overtime rule pays this worker: the account's (Timesheet rules) or his own override (Team > edit).
 *  override true = his own; false = the account's. Missing (workers saved before this setting) = what applied before:
 *  his own when the account was on "each worker's own setting", else the account's, so nobody's pay changes. */
export function usesAccountOvertime(pay: { overtime?: { on?: boolean; override?: boolean } } | undefined, otPreset: TimesheetSettings["otPreset"] | undefined) {
  const o = pay?.overtime?.override;
  if (o === true) return false;
  if (o === false) return true;
  return Boolean(otPreset) && otPreset !== "worker";
}

/** One-line summary of the account rule in plain words (rules screen, worker form, labor report). */
export function otSummary(s: OtSettings): string {
  const r = otRules(s);
  if (!r) return "Account overtime is off: only workers with their own overtime setting get overtime.";
  const parts = [`${multWords(r.mult)} after ${r.weekly || "—"} h a week`];
  if (r.daily) parts.push(`or after ${r.daily} h a day`);
  if (r.double) parts.push(`${multWords(r.dtMult)} after ${r.double} h a day`);
  if (r.seventh) parts.push("7th day in a row: first 8 h 1.5x, then 2x");
  return `Overtime: ${parts.join(", ")}.`;
}

export type OtDay = { date: string; hours: number; straight: number };
export type OtDayResult = { date: string; otHours: number; dtHours: number; premium: number };

/** One Mon-Sun week of days (sorted by the caller or here). `weekBonus`: non-discretionary bonus dollars that week. */
/** `countedHours`: paid time off counted toward the WEEKLY threshold only (owner switch); paid at its normal rate elsewhere, never at OT. */
export function overtimeTiers(days: OtDay[], rules: OtRules, weekBonus = 0, countedHours = 0): { days: OtDayResult[]; otHours: number; dtHours: number; premium: number; regularRate: number } {
  const list = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const totalH = list.reduce((s, d) => s + Math.max(0, d.hours), 0);
  const straight = list.reduce((s, d) => s + Math.max(0, d.straight), 0);
  const regularRate = totalH > 0 ? (straight + Math.max(0, weekBonus)) / totalH : 0;
  const worked = list.filter((d) => d.hours > 0);
  const seventhDate = rules.seventh && worked.length >= 7 ? worked[6].date : "";
  let weekRegular = Math.max(0, countedHours);
  const m = Math.max(1, rules.mult ?? 1.5), dm = Math.max(1, rules.dtMult ?? 2);
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
    return { date: d.date, otHours: r2(ot), dtHours: r2(dt), premium: r2(ot * (m - 1) * regularRate + dt * (dm - 1) * regularRate) };
  });
  return { days: out, otHours: r2(out.reduce((s, d) => s + d.otHours, 0)), dtHours: r2(out.reduce((s, d) => s + d.dtHours, 0)), premium: r2(out.reduce((s, d) => s + d.premium, 0)), regularRate };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A worker's own overtime (Team > edit, Override on) as tiers: weekly / daily, optional second tier and multipliers. */
export function workerOtRules(o: { on?: boolean; weekly?: string; daily?: string; multiplier?: string; dtDaily?: string; dtMultiplier?: string } | undefined): OtRules | null {
  if (!o?.on) return null;
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
  return { weekly: n(o.weekly), daily: n(o.daily), double: n(o.dtDaily), seventh: false, mult: n(o.multiplier) || 1.5, dtMult: n(o.dtMultiplier) || 2 };
}

/** Paid-off hours that count toward the weekly overtime threshold (default none: US federal counts only hours worked). */
export function countedOffHours(off: { pto?: number; sick?: number } | undefined, c: { pto?: boolean; sick?: boolean } | undefined) {
  return (c?.pto ? off?.pto || 0 : 0) + (c?.sick ? off?.sick || 0 : 0);
}
