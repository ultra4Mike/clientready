/**
 * Multi-day jobs (owner UI on top of the existing engine in lib/schedule): the schedule holds day 1; every further
 * day is a set of unpaid per-day crew rows dated 1..MULTI_DAY_SPAN days after it. No schema change: these helpers
 * only add, edit or drop those rows. Paid or clocked rows are history and are never moved or removed.
 */
import { lockedRow, MULTI_DAY_SPAN, scheduleDays, type CrewRow, type Schedule, type Worker } from "@/lib/schedule";
import { paySnapshot, readPaySettings } from "@/lib/pay-types";

export type JobDay = { date: string; startTime: string; endTime: string; workerIds: string[]; index: number; count: number; locked: boolean };
type Row = CrewRow & { clockMinutes?: number; hoursFromClock?: boolean };
type Sched = Pick<Schedule, "date" | "startTime" | "endTime" | "workerIds">;

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const addDaysYmd = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const dayOffset = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/** The job's days in date order: day 1 is the schedule; later days come from their crew rows. */
export function jobDays(schedule: Sched | null | undefined, crew: Row[] = []): JobDay[] {
  if (!schedule?.date || !isDate(schedule.date)) return [];
  const dates = [...scheduleDays(schedule, crew)].sort();
  return dates.map((date, i) => {
    if (i === 0) {
      const onDay = crew.filter((r) => r.workDate === date && r.employeeId).map((r) => r.employeeId);
      // Day 1 crew: people with a row on day 1; a single-day job (or one without rows yet) is the schedule's list.
      const ids = dates.length > 1 ? [...new Set(onDay)] : schedule.workerIds;
      return { date, startTime: schedule.startTime || "", endTime: schedule.endTime || "", workerIds: ids.length ? ids : schedule.workerIds, index: 1, count: dates.length, locked: false };
    }
    const rows = crew.filter((r) => r.workDate === date && r.employeeId);
    const open = rows.find((r) => !lockedRow(r)) || rows[0];
    return { date, startTime: open?.startTime || schedule.startTime || "", endTime: open?.endTime || schedule.endTime || "", workerIds: [...new Set(rows.map((r) => r.employeeId))], index: i + 1, count: dates.length, locked: rows.some((r) => lockedRow(r)) };
  });
}

/** "Day 2 of 3" (empty for a single-day job). */
export function dayLabel(day: Pick<JobDay, "index" | "count">) { return day.count > 1 ? `Day ${day.index} of ${day.count}` : ""; }

let seq = 0;
/** A fresh unpaid row for one person on one extra day (same pay snapshot as a newly assigned worker). */
function newRow(employeeId: string, date: string, startTime: string, endTime: string, crew: Row[], people: Worker[]): Row {
  const person = people.find((p) => p.id === employeeId);
  const like = crew.find((r) => r.employeeId === employeeId);
  const rate = person?.rate || like?.rate || "";
  const snap = person ? paySnapshot(readPaySettings(person.paySettings), rate) : { ...(like?.payType ? { payType: like.payType } : {}), ...(like?.fixedPay ? { fixedPay: like.fixedPay } : {}) };
  // Per-job pay (job amount, commission, hybrid job part) is earned once per job: it stays on day 1 only.
  const once: Partial<Row> = snap.payType === "job" ? { fixedPay: "0" } : snap.payType === "commission" ? { commissionPct: "0" } as Partial<Row> : snap.payType === "hybrid" ? { hybridJobAmount: "0" } as Partial<Row> : {};
  seq += 1;
  return {
    id: `crew-${employeeId}-d${date.replace(/-/g, "")}-${Date.now().toString(36)}${seq}`, employeeId, name: person?.name || like?.name || "Worker", rate,
    ...snap, ...once, hours: "", startTime, endTime, workDate: date, note: "", bonus: "", paidToWorker: false, paidDate: "",
  } as Row;
}

/** The next free date for a new day (the day after the last one), or "" when the 30-day span is full. */
export function nextDayDate(schedule: Sched, crew: Row[]) {
  const days = jobDays(schedule, crew).map((d) => d.date);
  const max = addDaysYmd(schedule.date, MULTI_DAY_SPAN);
  for (let d = addDaysYmd(days[days.length - 1] || schedule.date, 1); d <= max; d = addDaysYmd(d, 1)) if (!days.includes(d)) return d;
  return "";
}

/** + Add day: same crew and times as day 1, on the day after the last day. Null when day 1 has no crew or no room. */
export function addJobDay(schedule: Sched, crew: Row[], people: Worker[] = []): Row[] | null {
  const days = jobDays(schedule, crew);
  const first = days[0];
  const date = nextDayDate(schedule, crew);
  if (!first || !first.workerIds.length || !date) return null;
  let next = [...crew];
  // A single-day job's day-1 crew must exist as rows on day 1, or the engine can't anchor the later days.
  for (const id of first.workerIds) {
    if (!next.some((r) => r.employeeId === id && r.workDate === schedule.date && !lockedRow(r))) next = [...next, newRow(id, schedule.date, schedule.startTime || "", schedule.endTime || "", next, people)];
  }
  return [...next, ...first.workerIds.map((id) => newRow(id, date, schedule.startTime || "", schedule.endTime || "", next, people))];
}

/** Remove a later day: its unpaid, unclocked rows go; paid/clocked rows stay as history. Day 1 can't be removed here. */
export function removeJobDay(schedule: Sched, crew: Row[], date: string): Row[] {
  if (!schedule?.date || date === schedule.date) return crew;
  return crew.filter((r) => r.workDate !== date || lockedRow(r));
}

export type DayPatch = { date?: string; startTime?: string; endTime?: string; workerIds?: string[] };
/** Why a later day's new date can't be used ("" when fine). */
export function dayDateProblem(schedule: Sched, crew: Row[], from: string, to: string) {
  if (!isDate(to)) return "Pick a date.";
  if (to <= schedule.date) return "Later days must come after day 1.";
  if (to > addDaysYmd(schedule.date, MULTI_DAY_SPAN)) return `A job can run up to ${MULTI_DAY_SPAN} days after day 1.`;
  if (to !== from && jobDays(schedule, crew).some((d) => d.date === to)) return "That date is already a day of this job.";
  return "";
}

/** Edit a later day (date, times, crew). Paid/clocked rows keep their date and times; at least one person stays. */
export function updateJobDay(schedule: Sched, crew: Row[], date: string, patch: DayPatch, people: Worker[] = []): Row[] {
  if (!schedule?.date || date === schedule.date) return crew;
  if (patch.date !== undefined && patch.date !== date && dayDateProblem(schedule, crew, date, patch.date)) return crew;
  const day = jobDays(schedule, crew).find((d) => d.date === date);
  if (!day) return crew;
  const to = patch.date ?? date;
  const start = patch.startTime ?? day.startTime;
  const end = patch.endTime ?? day.endTime;
  let next = crew.map((r) => (r.workDate === date && !lockedRow(r) ? { ...r, workDate: to, startTime: start, endTime: end } : r));
  if (patch.workerIds) {
    const want = new Set(patch.workerIds);
    if (!want.size) return crew;
    next = next.filter((r) => r.workDate !== to || lockedRow(r) || want.has(r.employeeId));
    for (const id of patch.workerIds) if (!next.some((r) => r.workDate === to && r.employeeId === id)) next.push(newRow(id, to, start, end, next, people));
  }
  return next;
}

/** Everyone on any day of the job: the schedule's crew list must include later-day people, or a schedule save drops their rows. */
export function allDayWorkerIds(schedule: Sched, crew: Row[]) {
  const ids = [...schedule.workerIds];
  for (const day of jobDays(schedule, crew).slice(1)) for (const id of day.workerIds) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Calendar: one entry per day of each job (day 1 first, with its schedule; later days with their own times/crew). */
export function expandJobDays<J extends { doc: { data?: Record<string, unknown> }; schedule: Schedule }>(jobs: J[]): (J & { day?: { index: number; count: number; offset: number } })[] {
  const out: (J & { day?: { index: number; count: number; offset: number } })[] = [];
  for (const job of jobs) {
    const crew = (Array.isArray(job.doc.data?.crew) ? job.doc.data!.crew : []) as Row[];
    const days = jobDays(job.schedule, crew);
    if (days.length < 2) { out.push(job); continue; }
    for (const d of days) {
      const day = { index: d.index, count: d.count, offset: dayOffset(job.schedule.date, d.date) };
      if (d.index === 1) { out.push({ ...job, day }); continue; }
      const schedule: Schedule = { ...job.schedule, date: d.date, startTime: d.startTime, workerIds: d.workerIds };
      if (d.endTime) schedule.endTime = d.endTime; else delete schedule.endTime;
      out.push({ ...job, schedule, day });
    }
  }
  return out;
}
export const dragPayload = (docId: string, offset: number) => (offset ? `${docId}|${offset}` : docId);
export function readDragPayload(value: string) {
  const [docId, off] = String(value || "").split("|");
  const offset = Number(off) || 0;
  return { docId, offset: Number.isInteger(offset) && Math.abs(offset) <= MULTI_DAY_SPAN ? offset : 0 };
}
