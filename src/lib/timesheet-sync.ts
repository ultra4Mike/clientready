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
import { rowPayMoney, weekOf, type PayRow } from "@/lib/pay-types";
import { loadOwnerTimesheet, type DayApproval } from "@/lib/day-events";
import { applyFixes, buildDay, estimateDriveMinutes, type DaySheet, type FixRequest, type ScheduledJob, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";
import { allocateWeek, applySharesToCrew, type DayPay, type JobShare } from "@/lib/timesheet-pay";

export const CUTOVER_KEY = "clientready-timesheet-pay-cutover";
type Doc = { id: string; type?: string; title?: string; clientName?: string; data?: Record<string, unknown> };

export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const toIso = (date: string, hm: string) => (date && /^\d{1,2}:\d{2}/.test(hm || "") ? new Date(`${date}T${hm.slice(0, 5)}:00`).toISOString() : "");

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

export function readDocs(): Doc[] { try { return JSON.parse(window.localStorage.getItem(DOCS_KEY) || "[]"); } catch { return []; } }
function readOwnerClockSafe() { try { return readOwnerClock(); } catch { return []; } }
const rowDate = (row: { workDate?: string }, doc: Doc) => String(row.workDate || readSchedule(doc.data)?.date || "").slice(0, 10);

/** Every worker's day sheets for the 7 days from `week` (old clock entries count as taps). */
export function weekSheets(input: { workers: Worker[]; docs: Doc[]; events: TapEvent[]; fixes: FixRequest[]; settings: TimesheetSettings; week: string; now: string }) {
  const clockTaps: TapEvent[] = readOwnerClockSafe().flatMap((c) => [
    { id: `clk-${c.id}-in`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "start_job" as const, at: c.started_at, docId: c.doc_id },
    ...(c.ended_at ? [{ id: `clk-${c.id}-out`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "end_shift" as const, at: c.ended_at, docId: c.doc_id }] : []),
  ]);
  const events = applyFixes([...input.events, ...clockTaps], input.fixes);
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.week, i));
  const sheets = new Map<string, DaySheet>();
  for (const worker of input.workers) for (const date of days) {
    const schedule: ScheduledJob[] = input.docs.flatMap((doc) => {
      const s = readSchedule(doc.data);
      if (!s || s.date !== date || !s.workerIds.includes(worker.id)) return [];
      const start = toIso(s.date, s.startTime), end = toIso(s.date, s.endTime || "");
      return start && end ? [{ docId: doc.id, start, end, label: String(doc.data?.invoiceNumber || doc.clientName || "Job") }] : [];
    });
    const mine = events.filter((e) => e.employeeId === worker.id && e.date === date);
    const coords = new Map(mine.filter((e) => e.lat != null && e.docId).map((e) => [e.docId!, { lat: e.lat!, lng: e.lng! }]));
    const sheet = buildDay({ employeeId: worker.id, date, events: mine, schedule, settings: input.settings, now: input.now,
      expectedDriveMinutes: (a, b) => { const p = a && coords.get(a), q = b && coords.get(b); return p && q ? estimateDriveMinutes(p, q) : undefined; } });
    if (input.fixes.some((f) => f.employeeId === worker.id && f.date === date && f.status === "pending")) sheet.flags.push("fix_requested");
    sheets.set(`${worker.id}|${date}`, sheet);
  }
  return { days, sheets };
}

/** Per worker: the week's day pay and job shares from sheets + approvals. */
export function weekShares(input: { workers: Worker[]; docs: Doc[]; days: string[]; sheets: Map<string, DaySheet>; approvals: DayApproval[] }) {
  const pays = new Map<string, DayPay[]>();
  const shares = new Map<string, JobShare>(); // employeeId|date|docId
  for (const w of input.workers) {
    const list = input.days.map((date) => {
      const a = input.approvals.find((x) => x.employeeId === w.id && x.date === date);
      const approved = Boolean(a?.approvedAt);
      const fallbackDocIds = input.docs.filter((doc) => ((doc.data?.crew || []) as { employeeId?: string; workDate?: string }[]).some((r) => r.employeeId === w.id && rowDate(r, doc) === date)).map((doc) => doc.id);
      return { date, sheet: input.sheets.get(`${w.id}|${date}`), approved, approvedMinutes: a?.editedMinutes != null ? a.editedMinutes : approved ? a!.paidMinutes : null, fallbackDocIds };
    });
    const week = allocateWeek(list, w.paySettings, w.rate || "");
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
  const [data, cutover] = await Promise.all([loadOwnerTimesheet(week, addDays(week, 6)), syncTimesheetCutover()]);
  const workers = readWorkers();
  const docs = readDocs();
  const approvals = opts.approvals || data.approvals;
  const { days, sheets } = weekSheets({ workers, docs, events: data.events, fixes: data.fixes, settings: data.settings, week, now: opts.now || new Date().toISOString() });
  const { pays, shares } = weekShares({ workers, docs, days, sheets, approvals });
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
