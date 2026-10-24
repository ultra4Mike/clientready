/**
 * Time tracking phase 2 (pure: no storage, no network).
 *  - Job / task rates (prevailing wage): a rate on the job, or a task type's rate, replaces the base hourly wage there.
 *  - FLSA overtime for non-hourly pay (day rate, set amount per job, piece, commission): regular rate = week pay / hours,
 *    premium 0.5 x regular rate for hours over 40.
 *  - Minimum-wage top-up: a week whose straight pay / hours is under the minimum gets the difference.
 *  - PTO / sick accrual (1 h per N hours worked, caps), requests and balances.
 *  - Crew lead: which workers a lead may see / clock, never prices or pay.
 *  - Several crew on one job: labor = sum of each worker's row pay (each worker's share of his own day).
 */
import { readPaySettings, rowPayMoney, type PayRow, type PayType } from "./pay-types";
import type { TimesheetSettings } from "./timesheet";

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

type JobDoc = { id: string; data?: Record<string, unknown> | null };

/** Hourly rate that replaces the base wage on this job: the job's own rate, else its task type's rate, else 0 (= base). */
export function jobRateOf(doc: JobDoc | undefined, settings?: Partial<Pick<TimesheetSettings, "taskRates">>) {
  const d = (doc?.data || {}) as { jobRate?: unknown; taskType?: unknown };
  if (num(d.jobRate) > 0) return num(d.jobRate);
  const task = String(d.taskType || "").trim();
  return task && settings?.taskRates?.[task] ? num(settings.taskRates[task]) : 0;
}
export function jobRates(docs: JobDoc[], settings?: Partial<Pick<TimesheetSettings, "taskRates">>) {
  const out = new Map<string, number>();
  for (const doc of docs) { const r = jobRateOf(doc, settings); if (r > 0) out.set(doc.id, r); }
  return out;
}

/** Job price before tax (what a commission is a percent of). */
export function jobPrice(doc: JobDoc | undefined) {
  const items = ((doc?.data || {}) as { items?: { qty?: unknown; rate?: unknown }[] }).items || [];
  return r2(items.reduce((s, it) => s + num(it.qty) * num(it.rate), 0));
}

export const NON_HOURLY: PayType[] = ["day", "job", "piece", "commission"];

/** FLSA weekly overtime for non-hourly pay. `straight` = all pay for the week except overtime; `hours` = hours worked. */
export function flsaWeek(straight: number, hours: number, threshold = 40) {
  if (!(hours > threshold) || !(straight > 0)) return { regularRate: hours > 0 ? r2(straight / hours) : 0, otHours: 0, premium: 0 };
  const rr = straight / hours, ot = hours - threshold;
  return { regularRate: r2(rr), otHours: r2(ot), premium: r2(ot * 0.5 * rr) };
}

/** Minimum-wage top-up for a week (0 when off, no hours, or paid enough). */
export function minWageTopUp(straight: number, hours: number, minWage: number) {
  if (!(minWage > 0) || !(hours > 0)) return 0;
  return r2(Math.max(0, minWage * hours - straight));
}

/** Spread `cents` over days by weights (hours); whole cents that add up. */
export function spreadCents(cents: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length || !(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (cents * Math.max(0, w)) / sum);
  const out = exact.map(Math.floor);
  let left = Math.round(cents) - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

// ---------- PTO / sick ----------
export type PtoKind = "pto" | "sick" | "holiday";
/** Words for a time-off kind. Holiday = paid holiday the owner adds (never takes from the PTO balance). */
export function ptoKindLabel(kind: string, lower = false) { const w = kind === "sick" ? "Sick" : kind === "holiday" ? "Holiday" : "PTO"; return lower && w !== "PTO" ? w.toLowerCase() : w; }
export type PtoRequest = { id: string; employeeId: string; date: string; hours: number; kind: PtoKind; note?: string; status: "pending" | "approved" | "denied"; createdAt: string; decidedAt?: string | null };
export type PtoPolicy = Pick<TimesheetSettings, "ptoPreset" | "ptoPerHours" | "ptoCapHours" | "ptoUseCapHours" | "ptoWaitDays">;
/** Worker override: own accrual (hours per hour of PTO), a starting balance carried in, or off. */
export type PtoOverride = { ptoOff?: boolean; ptoPerHours?: number; ptoStartHours?: number };

export function ptoOn(policy: PtoPolicy, w: PtoOverride = {}) { return !w.ptoOff && (num(w.ptoPerHours) > 0 || policy.ptoPerHours > 0); }

/**
 * Balance for one worker for a calendar year: accrued from worked hours (1 h per N), capped, minus approved hours taken.
 * `workedHours`: hours worked this year (approved timesheet days). Pending requests are shown, not subtracted.
 */
export function ptoBalance(input: { policy: PtoPolicy; worker?: PtoOverride; workedHours: number; requests: PtoRequest[]; employeeId: string; year: string; hireDate?: string; today: string }) {
  const per = num(input.worker?.ptoPerHours) > 0 ? num(input.worker!.ptoPerHours) : input.policy.ptoPerHours;
  const on = ptoOn(input.policy, input.worker);
  const mine = input.requests.filter((r) => r.employeeId === input.employeeId && r.date.startsWith(input.year));
  const taken = r2(mine.filter((r) => r.status === "approved" && r.kind !== "holiday").reduce((s, r) => s + r.hours, 0));
  const pending = r2(mine.filter((r) => r.status === "pending" && r.kind !== "holiday").reduce((s, r) => s + r.hours, 0));
  let accrued = on && per > 0 ? input.workedHours / per : 0;
  accrued += num(input.worker?.ptoStartHours);
  if (input.policy.ptoCapHours > 0) accrued = Math.min(accrued, input.policy.ptoCapHours);
  accrued = Math.floor(accrued * 100) / 100;
  let waitUntil = "";
  if (input.policy.ptoWaitDays > 0 && input.hireDate && /^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) {
    const d = new Date(`${input.hireDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + input.policy.ptoWaitDays); waitUntil = d.toISOString().slice(0, 10);
  }
  const usable = waitUntil && input.today < waitUntil ? 0 : r2(Math.max(0, accrued - taken));
  const useCapLeft = input.policy.ptoUseCapHours > 0 ? r2(Math.max(0, input.policy.ptoUseCapHours - taken)) : Infinity;
  return { on, per, accrued, taken, pending, available: r2(Math.min(usable, useCapLeft)), waitUntil: waitUntil && input.today < waitUntil ? waitUntil : "" };
}

/** Why a request can't be made ("" when fine). */
export function ptoRequestProblem(req: { hours: number; date: string }, available: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date)) return "Pick a day.";
  if (!(req.hours > 0) || req.hours > 24) return "Hours must be between 0 and 24.";
  if (req.hours > available + 1e-9) return `Only ${available} hour${available === 1 ? "" : "s"} available.`;
  return "";
}

/** Pay for approved PTO hours (at the worker's base rate; hourly equivalent for salary/day pay). */
export function ptoPayCents(hours: number, rate: string, paySettings?: unknown) {
  const pay = readPaySettings(paySettings);
  let r = num(rate);
  if (pay.type === "salary") r = num(pay.salaryWeekly) / 40;
  else if (pay.type === "day" && !(r > 0)) r = num(pay.dayRate) / (num(pay.dayHours) || 8);
  return Math.round(hours * r * 100);
}

/** Approved PTO for a set of days: employeeId|date -> { hours, cents }. Only approved, never pending. */
export function ptoDays(requests: PtoRequest[], workers: { id: string; rate?: string; paySettings?: unknown }[], from: string, to: string) {
  const out = new Map<string, { hours: number; cents: number; kind: PtoKind; holidayHours: number }>();
  for (const r of requests) {
    if (r.status !== "approved" || r.date < from || r.date > to) continue;
    const w = workers.find((x) => x.id === r.employeeId); if (!w) continue;
    const k = `${r.employeeId}|${r.date}`; const prev = out.get(k);
    out.set(k, { hours: r2((prev?.hours || 0) + r.hours), cents: (prev?.cents || 0) + ptoPayCents(r.hours, w.rate || "", w.paySettings), kind: r.kind, holidayHours: r2((prev?.holidayHours || 0) + (r.kind === "holiday" ? r.hours : 0)) });
  }
  return out;
}

// ---------- Crew lead ----------
export type LeadPerms = { seeHours: boolean; clockTeam: boolean; approveFixes?: boolean };
export const DEFAULT_LEAD_PERMS: LeadPerms = { seeHours: true, clockTeam: true, approveFixes: false };
type LeadWorker = { id: string; name: string; email?: string; role?: string; active?: boolean; lead?: boolean; crewIds?: string[]; leadPerms?: Partial<LeadPerms> };
export const isLead = (w?: LeadWorker) => Boolean(w && (w.lead || (w.role || "").toLowerCase() === "lead"));
export function leadPerms(w?: LeadWorker): LeadPerms { return { ...DEFAULT_LEAD_PERMS, ...(w?.leadPerms || {}) }; }
/** The lead's crew: names and ids only (no rates, pay or prices). */
export function leadCrew(lead: LeadWorker | undefined, workers: LeadWorker[]) {
  if (!isLead(lead)) return [];
  const ids = new Set(lead!.crewIds || []);
  return workers.filter((w) => w.id !== lead!.id && ids.has(w.id) && w.active !== false).map((w) => ({ id: w.id, name: w.name }));
}
/** A lead may act on a worker only when that worker is on his crew and the owner allows it. */
export function leadMayAct(lead: LeadWorker | undefined, targetId: string, action: "see" | "clock") {
  if (!isLead(lead)) return false;
  const p = leadPerms(lead);
  if (action === "see" ? !p.seeHours : !p.clockTeam) return false;
  return targetId === lead!.id || (lead!.crewIds || []).includes(targetId);
}

// ---------- Several crew on one job ----------
/** Labor for a job with several crew: each row's own pay, added up; per-worker split for the job cost breakdown. */
export function jobLaborSplit(crew: (PayRow & { employeeId?: string; name?: string })[]) {
  const by = new Map<string, { name: string; cents: number }>();
  for (const row of crew) {
    const id = String(row.employeeId || row.name || "");
    const c = Math.round(rowPayMoney(row) * 100);
    const prev = by.get(id);
    by.set(id, { name: String(row.name || prev?.name || "Worker"), cents: (prev?.cents || 0) + c });
  }
  const rows = [...by.entries()].map(([employeeId, v]) => ({ employeeId, ...v }));
  return { rows, totalCents: rows.reduce((s, r) => s + r.cents, 0) };
}

/** Server requests win by id; this device's requests not yet on the server are kept (offline / not synced). */
export function mergePtoRequests(cloud: PtoRequest[], local: PtoRequest[]): PtoRequest[] {
  const ids = new Set(cloud.map((r) => r.id));
  return [...cloud, ...local.filter((r) => !ids.has(r.id))];
}

/** Owner approving a pending request: "" when it fits the available balance (holiday never counts), else the warning. */
export function ptoApproveWarning(req: { hours: number; kind?: string }, available: number) {
  if (req.kind === "holiday" || !(req.hours > available + 1e-9)) return "";
  return `This is ${req.hours} h but only ${available} h is available. Press “Approve anyway” to go over the balance.`;
}
