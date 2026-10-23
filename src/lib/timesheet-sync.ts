/**
 * Browser side of "crew pay from the approved day timesheet": builds each worker's week (day engine), turns it
 * into per-job shares (lib/timesheet-pay) and writes them on the jobs' crew rows, then refreshes the job's labor
 * cost through the usual path (jobCosts.labor = sum of crew row pay) and the crew pay rows (crew_jobs).
 * Works without migration 20261026110000: approvals/taps come from localStorage then.
 */
import { DOCS_KEY } from "@/lib/doc-sync";
import { readOwnerClock } from "@/lib/clock";
import { readHoursApprovals } from "@/lib/hours-approval";
import { readSchedule, readWorkers, type Worker } from "@/lib/schedule";
import { rowExtraPay, rowPayMoney, weekOf, type PayRow } from "@/lib/pay-types";
import { loadOwnerTimesheet, type DayApproval } from "@/lib/day-events";
import { applyFixes, buildDay, dedupeTaps, wallToIso, ymdTz, readWorkerOverrides, estimateDriveMinutes, type DaySheet, type FixRequest, type ScheduledJob, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";
import { readRouteMinutes } from "@/lib/route-cache";
import { jobPrice, jobRates } from "@/lib/pay-phase2";
import { allocateWeek, applySharesToCrew, unallocatedSalaryWeeks, type DayPay, type JobShare } from "@/lib/timesheet-pay";

export const CUTOVER_KEY = "clientready-timesheet-pay-cutover";
type Doc = { id: string; type?: string; title?: string; clientName?: string; data?: Record<string, unknown> };

export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => ymdTz(new Date(iso));
const toIso = (date: string, hm: string) => wallToIso(date, (hm || "").slice(0, 5));

/**
 * First day paid from the timesheet. Set once, the first time this runs after the switch, to the NEXT day, so
 * today's jobs (maybe already approved on the old card) and everything before keep their old pay exactly.
 */
export function timesheetCutover(today = addDays(localYmd(new Date().toISOString()), 1)) {
  try {
    const saved = window.localStorage.getItem(CUTOVER_KEY);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
    window.localStorage.setItem(CUTOVER_KEY, today);
  } catch { /* private mode: today */ }
  return today;
}

/**
 * One cutover per owner (crew_timesheet_settings.pay_cutover): the earliest day any device saved wins and is
 * written back here, so every device pays the same. Without the migration this device's value stays.
 */
export async function syncTimesheetCutover(): Promise<string> {
  const local = timesheetCutover();
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase.rpc("crew_claim_pay_cutover", { p_date: local });
    const cloud = typeof data === "string" ? data.slice(0, 10) : "";
    if (error || !/^\d{4}-\d{2}-\d{2}$/.test(cloud)) return local;
    try { window.localStorage.setItem(CUTOVER_KEY, cloud); } catch { /* private mode */ }
    return cloud;
  } catch { return local; }
}

/** The saved pay cutover, read-only ("" when Timesheet pay has never started on this device/account). */
export function readCutover(): string {
  try { const v = typeof window === "undefined" ? "" : window.localStorage.getItem(CUTOVER_KEY) || ""; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; } catch { return ""; }
}

/** Unallocated weekly salary (no hours) for Year packet / Crew pay: computed from pay settings + weeks, never stored. */
export function unallocatedSalary(workers: { id: string; name?: string; paySettings?: unknown }[], docs: Doc[], year?: string) {
  return unallocatedSalaryWeeks({ workers, docs, cutover: readCutover(), today: localYmd(new Date().toISOString()), year });
}

export function readDocs(): Doc[] { try { return JSON.parse(window.localStorage.getItem(DOCS_KEY) || "[]"); } catch { return []; } }
function readOwnerClockSafe() { try { return readOwnerClock(); } catch { return []; } }
const rowDate = (row: { workDate?: string }, doc: Doc) => String(row.workDate || readSchedule(doc.data)?.date || "").slice(0, 10);

/** The scheduled jobs for one worker on one day (what missing taps fill from). */
export function scheduleFor(docs: Doc[], workerId: string, date: string): ScheduledJob[] {
  return docs.flatMap((doc) => {
    const s = readSchedule(doc.data);
    if (!s || s.date !== date || !s.workerIds.includes(workerId)) return [];
    const start = toIso(s.date, s.startTime), end = toIso(s.date, s.endTime || "");
    // Job pin for the distance check, from coordinates saved on the doc (data.pin {lat,lng} or data.lat/lng), if any.
    const raw = (doc.data?.pin && typeof doc.data.pin === "object" ? doc.data.pin : doc.data) as Record<string, unknown> | undefined;
    const pin = raw && Number.isFinite(Number(raw.lat)) && Number.isFinite(Number(raw.lng)) && raw.lat !== "" && raw.lat != null ? { lat: Number(raw.lat), lng: Number(raw.lng) } : null;
    return start && end ? [{ docId: doc.id, start, end, label: String(doc.data?.invoiceNumber || doc.clientName || "Job"), ...(pin ? pin : {}) }] : [];
  });
}

/** Every worker's day sheets for the 7 days from `week` (old clock entries count as taps). */
export function weekSheets(input: { workers: Worker[]; docs: Doc[]; events: TapEvent[]; fixes: FixRequest[]; settings: TimesheetSettings; week: string; now: string }) {
  const clockTaps: TapEvent[] = readOwnerClockSafe().flatMap((c) => [
    { id: `clk-${c.id}-in`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "start_job" as const, at: c.started_at, docId: c.doc_id },
    ...(c.ended_at ? [{ id: `clk-${c.id}-out`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "end_shift" as const, at: c.ended_at, docId: c.doc_id }] : []),
  ]);
  // Old per-job clock entries count only on days with no My day taps (never both: no double hours).
  const tapDays = new Set(input.events.map((e) => `${e.employeeId}|${e.date}`));
  const events = applyFixes(dedupeTaps([...input.events, ...clockTaps.filter((c) => !tapDays.has(`${c.employeeId}|${c.date}`))]), input.fixes);
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.week, i));
  const sheets = new Map<string, DaySheet>();
  for (const worker of input.workers) for (const date of days) {
    const schedule = scheduleFor(input.docs, worker.id, date);
    const mine = events.filter((e) => e.employeeId === worker.id && e.date === date);
    const coords = new Map(mine.filter((e) => e.lat != null && e.docId).map((e) => [e.docId!, { lat: e.lat!, lng: e.lng! }]));
    const sheet = buildDay({ employeeId: worker.id, date, events: mine, schedule, settings: input.settings, worker: readWorkerOverrides(worker), now: input.now,
      expectedDriveMinutes: (a, b) => { const routed = a && b ? readRouteMinutes(date, a, b) : undefined; if (routed !== undefined) return routed; const p = a && coords.get(a), q = b && coords.get(b); return p && q ? estimateDriveMinutes(p, q) : undefined; } });
    if (input.fixes.some((f) => f.employeeId === worker.id && f.date === date && f.status === "pending")) sheet.flags.push("fix_requested");
    sheets.set(`${worker.id}|${date}`, sheet);
  }
  return { days, sheets };
}

/** Per worker: the week's day pay and job shares from sheets + approvals. */
export function weekShares(input: { workers: Worker[]; docs: Doc[]; days: string[]; sheets: Map<string, DaySheet>; approvals: DayApproval[]; settings?: Partial<TimesheetSettings> }) {
  const pays = new Map<string, DayPay[]>();
  const shares = new Map<string, JobShare>(); // employeeId|date|docId
  for (const w of input.workers) {
    const list = input.days.map((date) => {
      const a = input.approvals.find((x) => x.employeeId === w.id && x.date === date);
      const approved = Boolean(a?.approvedAt);
      const fallbackDocIds = input.docs.filter((doc) => ((doc.data?.crew || []) as { employeeId?: string; workDate?: string }[]).some((r) => r.employeeId === w.id && rowDate(r, doc) === date)).map((doc) => doc.id);
      return { date, sheet: input.sheets.get(`${w.id}|${date}`), approved, approvedMinutes: a?.editedMinutes != null ? a.editedMinutes : approved ? a!.paidMinutes : null, fallbackDocIds };
    });
    // Non-discretionary bonuses on this worker's rows this week count in the FLSA regular rate (rows marked discretionary don't).
    const weekBonus = new Map<string, number>();
    const wk = weekOf(input.days[0]);
    for (const doc of input.docs) for (const r of ((doc.data?.crew || []) as { employeeId?: string; workDate?: string; bonus?: string; bonusDiscretionary?: boolean }[])) {
      if (r.employeeId !== w.id || r.bonusDiscretionary || !input.days.includes(rowDate(r, doc))) continue;
      const b = Number(String(r.bonus ?? "").replace(/[^0-9.-]/g, "")); if (b > 0) weekBonus.set(wk, (weekBonus.get(wk) || 0) + b);
    }
    // Piece / commission / hybrid extras on his rows this week (FLSA regular rate + min-wage check).
    const weekExtra = new Map<string, number>();
    for (const doc of input.docs) for (const r of ((doc.data?.crew || []) as (PayRow & { employeeId?: string; workDate?: string })[])) {
      if (r.employeeId !== w.id || !input.days.includes(rowDate(r, doc))) continue;
      const e = rowExtraPay(r.payType === "commission" && !r.commissionBase ? { ...r, commissionBase: String(jobPrice(doc as never)) } : r);
      if (e > 0) weekExtra.set(wk, (weekExtra.get(wk) || 0) + e);
    }
    const week = allocateWeek(list, w.paySettings, w.rate || "", { halfDayHours: input.settings?.halfDayHours, settings: input.settings, weekBonus, weekExtra, jobRates: jobRates(input.docs as never, input.settings) });
    // Unallocated salary only for weeks from the pay cutover / his pay start up to this week (same rule as Year packet).
    if (week.some((d) => d.unallocated)) {
      const owed = unallocatedSalaryWeeks({ workers: [w], docs: [], cutover: readCutover() || timesheetCutover(), today: localYmd(new Date().toISOString()) }).some((u) => u.week === weekOf(input.days[0]));
      if (!owed) week.forEach((d) => { if (d.unallocated) { d.cents = 0; d.unallocated = false; } });
    }
    pays.set(w.id, week);
    for (const day of week) for (const s of day.shares) shares.set(`${w.id}|${s.date}|${s.docId}`, s);
  }
  return { pays, shares };
}

/**
 * Write the shares on the crew rows of every doc touched by these days; labor = sum of row pay (same as the invoice).
 * Returns the changed docs (already saved to localStorage). Never touches payments or totals.
 */
export function applyWeekToDocs(docs: Doc[], shares: Map<string, JobShare>, cutover: string) {
  const changed: Doc[] = [];
  const next = docs.map((doc) => {
    const crew = (Array.isArray(doc.data?.crew) ? doc.data!.crew : []) as (PayRow & { id: string; employeeId: string; workDate?: string; paidToWorker?: boolean })[];
    if (!crew.length) return doc;
    const mine = new Map<string, JobShare>();
    for (const row of crew) { const s = shares.get(`${row.employeeId}|${rowDate(row, doc)}|${doc.id}`); if (s) mine.set(`${row.employeeId}|${rowDate(row, doc)}`, s); }
    if (!mine.size) return doc;
    const old = readHoursApprovals(doc.data?.hoursApprovals);
    const oldIds = new Set(Object.entries(old).filter(([, a]) => !a.revokedAt).map(([id]) => id));
    // Rows with no workDate use the schedule date for matching.
    const dated = crew.map((row) => ({ ...row, workDate: rowDate(row, doc) }));
    const res = applySharesToCrew(dated, doc.id, mine, cutover, oldIds);
    // Commission rows not paid yet follow the job price (before tax).
    const price = (jobPrice(doc as never)).toFixed(2);
    res.crew = res.crew.map((row) => { if (row.payType !== "commission" || row.paidToWorker || row.commissionBase === price) return row; res.changed = true; return { ...row, commissionBase: price }; });
    if (!res.changed) return doc;
    const out = res.crew.map((row, i) => ({ ...row, workDate: crew[i].workDate ?? row.workDate }));
    const costs = (doc.data?.jobCosts || {}) as Record<string, unknown>;
    const labor = out.reduce((sum, row) => sum + rowPayMoney(row), 0).toFixed(2);
    const updated = { ...doc, data: { ...doc.data, crew: out, jobCosts: { ...costs, labor } } };
    changed.push(updated);
    return updated;
  });
  if (changed.length) {
    // Patch only the changed docs into the latest stored list.
    const ids = new Map(changed.map((d) => [d.id, d]));
    try { window.localStorage.setItem(DOCS_KEY, JSON.stringify(readDocs().map((d) => ids.get(d.id) || d))); } catch { /* full */ }
  }
  return { docs: next, changed };
}

/** Save changed docs to the cloud and refresh their crew pay rows (best effort; local copy already updated). */
export async function pushChangedDocs(changed: Doc[]) {
  if (!changed.length) return;
  try {
    const { saveCloudDocument } = await import("@/lib/cloud-docs");
    const { syncCrewPayRows } = await import("@/lib/schedule");
    for (const doc of changed) {
      if (!/^[0-9a-f-]{36}$/i.test(doc.id)) continue;
      await saveCloudDocument(doc as never).catch(() => doc.id);
      await syncCrewPayRows(doc as never).catch(() => undefined);
    }
  } catch { /* offline: the account cache pushes newer local docs later */ }
}

/** Recompute the shares for the week containing `date` and write them on the jobs. Used by Timesheet and the invoice. */
export async function refreshTimesheetPay(date: string, opts: { approvals?: DayApproval[]; now?: string } = {}) {
  const week = weekOf(date);
  // A direct refresh replaces a queued auto-refresh for this week (no double refresh); the event still fires after it.
  const queued = autoRefresh.get(week);
  if (queued) { clearTimeout(queued.timer); autoRefresh.delete(week); }
  try { return await refreshWeek(date, week, opts); } finally { if (queued) fireTimesheetChanged(queued.source, [week]); }
}
async function refreshWeek(date: string, week: string, opts: { approvals?: DayApproval[]; now?: string }) {
  const [data, cutover] = await Promise.all([loadOwnerTimesheet(week, addDays(week, 6)), syncTimesheetCutover()]);
  const workers = readWorkers();
  const docs = readDocs();
  const approvals = opts.approvals || data.approvals;
  const { days, sheets } = weekSheets({ workers, docs, events: data.events, fixes: data.fixes, settings: data.settings, week, now: opts.now || new Date().toISOString() });
  const { pays, shares } = weekShares({ workers, docs, days, sheets, approvals, settings: data.settings });
  const applied = applyWeekToDocs(docs, shares, cutover);
  void pushChangedDocs(applied.changed);
  return { ...applied, pays, sheets, approvals };
}

/** Invoice-card shortcut: approve (or undo) ONE worker's whole day on the timesheet, then refresh the jobs. */
export async function setWorkerDayApproved(employeeId: string, date: string, approve: boolean) {
  const { saveApprovals } = await import("@/lib/day-events");
  const first = await refreshTimesheetPay(date);
  const prev = first.approvals.find((a) => a.employeeId === employeeId && a.date === date);
  const sheet = first.sheets.get(`${employeeId}|${date}`);
  const row: DayApproval = {
    employeeId, date,
    paidMinutes: prev?.editedMinutes ?? sheet?.paidMinutes ?? prev?.paidMinutes ?? 0,
    driveMinutes: sheet?.driveMinutes ?? prev?.driveMinutes ?? 0,
    editedMinutes: prev?.editedMinutes ?? null,
    approvedAt: approve ? new Date().toISOString() : null,
  };
  await saveApprovals([row]);
  const approvals = [...first.approvals.filter((a) => !(a.employeeId === employeeId && a.date === date)), row];
  return refreshTimesheetPay(date, { approvals });
}

/** Window event fired after approvals or rules were saved and pay was refreshed. detail: { source, weeks }. Listeners should reload, not save. */
export const TIMESHEET_CHANGED_EVENT = "clientready:timesheet-changed";
function fireTimesheetChanged(source: "approvals" | "settings", weeks: string[]) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TIMESHEET_CHANGED_EVENT, { detail: { source, weeks } }));
}
const autoRefresh = new Map<string, { timer: ReturnType<typeof setTimeout>; source: "approvals" | "settings" }>();
/**
 * Queue a pay refresh for the weeks of `dates` (used by saveApprovals / saveTimesheetSettings). It runs on the next
 * tick; if the caller calls refreshTimesheetPay for that week first, the queued one is dropped (one refresh, one event).
 */
export function queueTimesheetRefresh(dates: string[], source: "approvals" | "settings") {
  for (const week of new Set(dates.filter(Boolean).map((d) => weekOf(d)))) {
    const old = autoRefresh.get(week);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
      autoRefresh.delete(week);
      void refreshWeek(week, week, {}).catch(() => undefined).finally(() => fireTimesheetChanged(source, [week]));
    }, 0);
    autoRefresh.set(week, { timer, source });
  }
}
