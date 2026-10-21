import { derivedWhen, isoDate } from "@/lib/job-when";
import { readChecklist, type ChecklistItem } from "@/lib/checklist";
import { supabase } from "@/lib/supabase";
import { isUuid, saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";
import { moneySnapshot } from "@/lib/change-orders";
import { readOverrides, type Override } from "@/lib/conflicts";

export type JobStatus = "scheduled" | "in_progress" | "done";
export type Schedule = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime?: string;
  workerIds: string[];
  status: JobStatus;
  updatedAt: string;
  /** Note shown to the assigned crew (not the customer-facing invoice notes). */
  crewNote?: string;
  /** Set by the crew's "mark done" (with photos); confirmedAt is set by the owner. */
  doneAt?: string;
  doneBy?: string;
  confirmedAt?: string;
  /** Set by the crew's "On my way" tap (time + crew member's name). Shown to the owner; never sent. */
  onMyWayAt?: string;
  onMyWayBy?: string;
  /** Job-complete checklist (owner writes, crew tick). */
  checklist?: ChecklistItem[];
  /** "Book anyway" decisions: this person may overlap that other job (lib/conflicts). */
  overrides?: Override[];
};
export type Worker = { id: string; name: string; email?: string; phone?: string; role?: string; rate?: string; active?: boolean };
/** The older per-job crew/pay rows (data.crew). */
export type CrewRow = {
  id: string; employeeId: string; name: string; rate: string; hours: string; startTime: string; endTime: string;
  workDate: string; note: string; bonus: string; paidToWorker: boolean; paidDate: string;
};

export const STATUS_LABEL: Record<JobStatus, string> = { scheduled: "Scheduled", in_progress: "In progress", done: "Done" };
export const STATUS_CLASS: Record<JobStatus, string> = {
  scheduled: "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-200",
  in_progress: "border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200",
  done: "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
};

/** A done job is "awaiting" until the owner confirms it (schedule.confirmedAt), then "confirmed". */
export type DoneState = "awaiting" | "confirmed";
export function doneState(schedule: Pick<Schedule, "status" | "confirmedAt">): DoneState | null {
  if (schedule.status !== "done") return null;
  return schedule.confirmedAt ? "confirmed" : "awaiting";
}
export const DONE_LABEL: Record<DoneState, string> = { awaiting: "Done · awaiting confirmation", confirmed: "Done · confirmed" };
/** Same look as done, dashed + amber edge while it still needs the owner's confirmation. */
export const DONE_CLASS: Record<DoneState, string> = {
  awaiting: "border-2 border-dashed border-orange-400 bg-orange-500/10 text-orange-800 dark:text-orange-200",
  confirmed: "border-emerald-600 bg-emerald-500/30 font-semibold text-emerald-900 dark:text-emerald-100",
};
export function statusLabel(schedule: Pick<Schedule, "status" | "confirmedAt">) {
  const done = doneState(schedule);
  return done ? DONE_LABEL[done] : STATUS_LABEL[schedule.status];
}
export function statusClass(schedule: Pick<Schedule, "status" | "confirmedAt">) {
  const done = doneState(schedule);
  return done ? DONE_CLASS[done] : STATUS_CLASS[schedule.status];
}

const DOCS_KEY = "clientready-documents";
const isDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: unknown) => typeof value === "string" && /^\d{2}:\d{2}$/.test(value);

/** Pulls an HH:MM out of the old free-text jobTime ("9:30", "9am", "2:15 PM"). */
export function parseLegacyTime(value: unknown) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const ampm = (match[3] || "").toLowerCase();
  if (ampm.startsWith("p") && hour < 12) hour += 12;
  if (ampm.startsWith("a") && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The stored schedule, or one derived from older fields: a doc with a jobTime is read as
 * scheduled on its due date at that time (nothing is written until the owner edits it).
 */
export function readSchedule(data: Record<string, unknown> | undefined): Schedule | null {
  const raw = data?.schedule as Partial<Schedule> | undefined;
  if (raw && isDate(raw.date)) {
    const status = raw.status === "in_progress" || raw.status === "done" ? raw.status : "scheduled";
    return {
      date: String(raw.date),
      startTime: isTime(raw.startTime) ? String(raw.startTime) : "",
      ...(isTime(raw.endTime) ? { endTime: String(raw.endTime) } : {}),
      workerIds: Array.isArray(raw.workerIds) ? raw.workerIds.map(String) : [],
      status,
      updatedAt: String(raw.updatedAt || ""),
      ...(raw.crewNote ? { crewNote: String(raw.crewNote).slice(0, 500) } : {}),
      ...(raw.doneAt ? { doneAt: String(raw.doneAt) } : {}),
      ...(raw.doneBy ? { doneBy: String(raw.doneBy) } : {}),
      ...(raw.confirmedAt ? { confirmedAt: String(raw.confirmedAt) } : {}),
      ...(raw.onMyWayAt ? { onMyWayAt: String(raw.onMyWayAt) } : {}),
      ...(raw.onMyWayBy ? { onMyWayBy: String(raw.onMyWayBy).slice(0, 80) } : {}),
      ...(readChecklist(raw.checklist).length ? { checklist: readChecklist(raw.checklist) } : {}),
      ...(readOverrides(raw.overrides).length ? { overrides: readOverrides(raw.overrides) } : {}),
    };
  }
  // A job with a start time but no schedule is still on the calendar (shared rule: lib/job-when).
  const derived = derivedWhen(data);
  if (derived) return { date: derived.date, startTime: derived.startTime, ...(derived.endTime ? { endTime: derived.endTime } : {}), workerIds: derived.workerIds, status: "scheduled", updatedAt: "" };
  if (data?.jobTime && isDate(data?.dueDate)) {
    return { date: String(data.dueDate), startTime: parseLegacyTime(data.jobTime), workerIds: [], status: "scheduled", updatedAt: "" };
  }
  return null;
}

/**
 * The invoice form's view of the schedule on save: edits to Job start/end or a crew row's work date
 * move the schedule (rows paid to the worker are history and don't); with no schedule, a start time
 * plus a date (crew work date, else invoice date) creates one.
 */
export function jobScheduleFromForm(base: Schedule | null, form: { jobStart: string; jobEnd: string; invoiceDate: string; crew: { employeeId?: string; workDate?: string; paidToWorker?: boolean }[] }): Schedule | null {
  const stamp = new Date().toISOString();
  if (!base) {
    const derived = readSchedule({ jobStart: form.jobStart, jobEnd: form.jobEnd, invoiceDate: form.invoiceDate, crew: form.crew });
    return derived ? { ...derived, updatedAt: stamp } : null;
  }
  const edited = form.crew.find((row) => !row.paidToWorker && isoDate(row.workDate) && row.workDate !== base.date);
  const next: Schedule = { ...base };
  if (edited) next.date = isoDate(edited.workDate);
  if (isTime(form.jobStart)) {
    next.startTime = form.jobStart;
    if (isTime(form.jobEnd) && form.jobEnd > form.jobStart) next.endTime = form.jobEnd; else delete next.endTime;
  }
  const changed = next.date !== base.date || next.startTime !== base.startTime || (next.endTime || "") !== (base.endTime || "");
  return changed ? { ...next, updatedAt: stamp } : base;
}

export function scheduleStamp(value: unknown) {
  const time = Date.parse(String((value as { updatedAt?: string } | undefined)?.updatedAt || ""));
  return Number.isNaN(time) ? 0 : time;
}

/** Of two schedule blocks, the one edited last (crew status updates can arrive in the cloud). */
export function newerSchedule(a: unknown, b: unknown) {
  if (!a) return b;
  if (!b) return a;
  return scheduleStamp(b) > scheduleStamp(a) ? b : a;
}

export function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function hhmm(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Moves a schedule to a new date/start, keeping its length. */
export function moveSchedule(schedule: Schedule, date: string, startTime?: string): Schedule {
  const start = startTime ?? schedule.startTime;
  let endTime = schedule.endTime;
  if (startTime && schedule.startTime && schedule.endTime) {
    endTime = hhmm(minutes(startTime) + (minutes(schedule.endTime) - minutes(schedule.startTime)));
  }
  return { ...schedule, date, startTime: start, ...(endTime ? { endTime } : {}) };
}

function allEmployees(): Worker[] {
  try {
    const raw = window.localStorage.getItem("clientready-employees");
    return raw ? (JSON.parse(raw) as Worker[]).filter((person) => person && person.id) : [];
  } catch {
    return [];
  }
}

/**
 * One id per person: drops repeats, and folds ids of legacy duplicate employee records that share
 * an email into the first id seen for that email.
 */
export function dedupeWorkerIds(ids: string[], people: Worker[] = allEmployees()) {
  const emailOf = new Map(people.map((person) => [person.id, (person.email || "").trim().toLowerCase()]));
  const seenIds = new Set<string>();
  const seenEmails = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seenIds.has(id)) continue;
    const email = emailOf.get(id) || "";
    if (email && seenEmails.has(email)) continue;
    seenIds.add(id);
    if (email) seenEmails.add(email);
    out.push(id);
  }
  return out;
}

export function crewIds(crew: unknown) {
  return Array.isArray(crew) ? (crew as CrewRow[]).map((row) => row?.employeeId).filter(Boolean) : [];
}

/**
 * The crew/pay rows that match an assignment: rows of people still assigned are kept untouched
 * (hours, pay, notes intact); people newly assigned get an empty row at their saved rate;
 * rows of people no longer assigned are dropped.
 */
/**
 * One source of truth for when a job happens: the schedule. Crew pay rows copy its date and times
 * (so the crew page, timesheets and the owner calendar agree after a reschedule); a row already
 * paid to the worker keeps its recorded date as history.
 */
export function followSchedule<R extends { workDate?: string; startTime?: string; endTime?: string; paidToWorker?: boolean }>(row: R, schedule: Pick<Schedule, "date" | "startTime" | "endTime"> | null): R {
  if (!schedule?.date || row.paidToWorker) return row;
  return { ...row, workDate: schedule.date, startTime: schedule.startTime || row.startTime || "", endTime: schedule.endTime || row.endTime || "" };
}

export function crewForWorkers(crew: CrewRow[], workerIds: string[], schedule: Pick<Schedule, "date" | "startTime" | "endTime"> | null, people: Worker[] = allEmployees()) {
  const keep = new Set(workerIds);
  const kept = crew.filter((row) => keep.has(row.employeeId)).map((row) => followSchedule(row, schedule));
  const have = new Set(kept.map((row) => row.employeeId));
  const byId = new Map(people.map((person) => [person.id, person]));
  const added = workerIds.filter((id) => !have.has(id)).map((id) => ({
    id: `crew-${id}`, employeeId: id, name: byId.get(id)?.name || "Worker", rate: byId.get(id)?.rate || "",
    hours: "", startTime: schedule?.startTime || "", endTime: schedule?.endTime || "", workDate: schedule?.date || "",
    note: "", bonus: "", paidToWorker: false, paidDate: "",
  }));
  return [...kept, ...added];
}

/** Hours or pay already recorded for these people on this job (crew rows, plus clock entries). */
export function workLogged(crew: CrewRow[], ids: string[], clockHours: Record<string, number> = {}, people: Worker[] = allEmployees()) {
  const names = new Map(people.map((person) => [person.id, person.name]));
  return ids.map((id) => {
    const rows = crew.filter((row) => row.employeeId === id);
    const hours = rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
    const bonus = rows.reduce((sum, row) => sum + (Number(String(row.bonus).replace(/[^0-9.-]/g, "")) || 0), 0);
    const paid = rows.some((row) => row.paidToWorker);
    const clocked = clockHours[id] || 0;
    return { id, name: names.get(id) || rows[0]?.name || "This worker", hours, bonus, paid, clocked };
  }).filter((item) => item.hours > 0 || item.bonus > 0 || item.paid || item.clocked > 0);
}

/**
 * Asks before removing people who already have hours/pay on the job. Returns true to go ahead.
 * Names each person and their hours; Cancel keeps everything.
 */
export function confirmRemoval(logged: ReturnType<typeof workLogged>) {
  if (!logged.length) return true;
  const lines = logged.map((item) => {
    const parts = [];
    if (item.hours > 0) parts.push(`${item.hours} hour${item.hours === 1 ? "" : "s"} logged`);
    if (item.clocked > 0) parts.push(`${item.clocked.toFixed(2)} hours clocked`);
    if (item.bonus > 0) parts.push(`$${item.bonus.toFixed(2)} extra pay`);
    if (item.paid) parts.push("marked paid to worker");
    return `${item.name}: ${parts.join(", ")}`;
  });
  return window.confirm(`Remove from this job?\n\n${lines.join("\n")}\n\nTheir hours and pay row on this job will be deleted. Cancel keeps everything.`);
}

/** Confirm step for a stored job (calendar, Schedule section). */
export function confirmRemovalFor(docId: string, removedIds: string[]) {
  const doc = readDocs().find((item) => item.id === docId);
  const crew = (Array.isArray(doc?.data?.crew) ? doc?.data?.crew : []) as CrewRow[];
  return confirmRemoval(workLogged(crew, removedIds, clockHoursFor(docId)));
}

/** Clocked hours per worker on a job, from the owner's cached clock entries. */
export function clockHoursFor(docId: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem("clientready-clock-entries");
    const entries = raw ? (JSON.parse(raw) as { doc_id: string; employee_id: string; started_at: string; ended_at?: string | null }[]) : [];
    const out: Record<string, number> = {};
    for (const entry of entries) {
      if (entry.doc_id !== docId || !entry.started_at) continue;
      const end = entry.ended_at ? Date.parse(entry.ended_at) : Date.now();
      out[entry.employee_id] = (out[entry.employee_id] || 0) + Math.max(0, end - Date.parse(entry.started_at)) / 3600000;
    }
    return out;
  } catch {
    return {};
  }
}

export class UnconfirmedRemovalError extends Error {}

/** Refuses to drop crew rows that hold hours/pay unless that person's removal was confirmed. */
function guardDroppedRows(before: CrewRow[], after: CrewRow[], confirmed: string[] = []) {
  const keptIds = new Set(after.map((row) => row.id));
  const dropped = before.filter((row) => !keptIds.has(row.id) && !confirmed.includes(row.employeeId));
  const risky = workLogged(dropped, [...new Set(dropped.map((row) => row.employeeId))]);
  if (risky.length) throw new UnconfirmedRemovalError(`Removing ${risky.map((item) => item.name).join(", ")} would delete logged hours`);
}

/** Money snapshot without the crew rows (which assignment may add/remove), so other money can't move. */
function moneyExceptCrew(data: Record<string, unknown> | undefined) {
  return moneySnapshot({ ...(data || {}), crew: undefined });
}

function readDocs(): CloudDoc[] {
  try {
    const raw = window.localStorage.getItem(DOCS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function readWorkers(): Worker[] {
  try {
    const raw = window.localStorage.getItem("clientready-employees");
    const list = raw ? (JSON.parse(raw) as Worker[]) : [];
    return list.filter((person) => person && person.id && person.active !== false);
  } catch {
    return [];
  }
}

/**
 * Sets data.schedule on the stored doc (null clears it) and keeps the crew/pay rows (data.crew)
 * in step with schedule.workerIds, which is the one list of who is on the job:
 * - first time a job is scheduled, people already in its crew rows are assigned too;
 * - after that, crew rows follow workerIds (new people get an empty row, removed people's rows go).
 * Unscheduling keeps the crew rows. Throws if any other money, status or payment field would
 * change, or if a kept crew row would change.
 */
export function applySchedule<T extends CloudDoc>(docs: T[], docId: string, schedule: Schedule | null, confirmed: string[] = []) {
  const index = docs.findIndex((doc) => doc.id === docId);
  if (index < 0) return null;
  const doc = docs[index];
  const before = moneyExceptCrew(doc.data);
  const data: Record<string, unknown> = { ...(doc.data || {}) };
  const crew = (Array.isArray(data.crew) ? data.crew : []) as CrewRow[];
  if (schedule) {
    const ids = dedupeWorkerIds(data.schedule ? schedule.workerIds : [...schedule.workerIds, ...crewIds(crew)]);
    data.schedule = { ...schedule, workerIds: ids, updatedAt: new Date().toISOString() };
    data.crew = crewForWorkers(crew, ids, schedule);
  } else {
    delete data.schedule;
  }
  const updated = { ...doc, data } as T;
  guardDroppedRows(crew, (updated.data.crew || []) as CrewRow[], confirmed);
  if (moneyExceptCrew(updated.data) !== before) throw new Error("Schedule change would touch money fields");
  // Pay fields stay as typed; only the date/times follow the schedule (one source of truth).
  const payOnly = (row: CrewRow) => JSON.stringify({ ...row, workDate: undefined, startTime: undefined, endTime: undefined });
  const keptBefore = new Map(crew.map((row) => [row.id, payOnly(row)]));
  for (const row of (updated.data.crew || []) as CrewRow[]) {
    if (keptBefore.has(row.id) && keptBefore.get(row.id) !== payOnly(row)) throw new Error("Schedule change would edit crew pay");
  }
  const next = [...docs];
  next[index] = updated;
  return { docs: next, doc: updated };
}

/** Saves a schedule change locally and to the account, then refreshes the crew's job list. */
/**
 * Assign people to a job from either place (schedule chips or the crew/pay section).
 * Scheduled jobs go through saveSchedule; unscheduled ones only update the crew rows.
 */
export async function saveAssignment(docId: string, workerIds: string[], confirmed: string[] = []) {
  const doc = readDocs().find((item) => item.id === docId);
  if (!doc) return null;
  const current = (doc.data?.schedule ? readSchedule(doc.data) : null);
  if (current) return saveSchedule(docId, { ...current, workerIds }, confirmed);
  const before = moneyExceptCrew(doc.data);
  const ids = dedupeWorkerIds(workerIds);
  const crew = (Array.isArray(doc.data?.crew) ? doc.data.crew : []) as CrewRow[];
  const next: CloudDoc = { ...doc, data: { ...(doc.data || {}), crew: crewForWorkers(crew, ids, null) } };
  guardDroppedRows(crew, next.data.crew as CrewRow[], confirmed);
  if (moneyExceptCrew(next.data) !== before) throw new Error("Assignment would touch money fields");
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(readDocs().map((item) => (item.id === docId ? next : item))));
  const cloudId = await saveCloudDocument(next);
  const saved = { ...next, id: cloudId };
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(readDocs().map((item) => (item.id === docId ? saved : item))));
  await syncCrewPayRows(saved);
  return saved;
}

/** Re-writes the crew pay rows (existing saveCrewJobs) from the stored crew list. */
async function syncCrewPayRows(doc: CloudDoc) {
  if (!isUuid(doc.id)) return;
  const data = doc.data || {};
  const { saveCrewJobs } = await import("@/lib/crew");
  const schedule = data.schedule ? readSchedule(data) : null;
  await saveCrewJobs(doc.id, {
    date: schedule?.date || "",
    invoiceNumber: String(data.invoiceNumber || doc.title || ""),
    clientName: String(data.clientName || ""),
    clientPhone: String(data.clientPhone || ""),
    clientAddress: String(data.clientAddress || ""),
    status: String(data.status || ""),
    startTime: schedule?.startTime || String(data.jobStart || ""),
    endTime: schedule ? schedule.endTime || "" : String(data.jobEnd || ""),
  }, ((Array.isArray(data.crew) ? data.crew : []) as CrewRow[]).map((row) => followSchedule(row, schedule)));
}

export async function saveSchedule(docId: string, schedule: Schedule | null, confirmed: string[] = []) {
  const applied = applySchedule(readDocs(), docId, schedule, confirmed);
  if (!applied) return null;
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(applied.docs));
  const cloudId = await saveCloudDocument(applied.doc);
  // saveCloudDocument may adopt the cloud's approval/schedule and stamps updatedAt: store that copy.
  const latest = readDocs().map((doc) => (doc.id === docId ? { ...applied.doc, id: cloudId } : doc));
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(latest));
  await syncScheduleCrewJobs({ ...applied.doc, id: cloudId });
  await syncCrewPayRows({ ...applied.doc, id: cloudId });
  return { ...applied.doc, id: cloudId };
}

/**
 * Mirrors a job's schedule into crew_jobs (one row per assigned worker, id "<doc>-sched-<worker>"),
 * which is what signed-in crew members can read. Carries date, times, client contact and the
 * schedule status only: no prices, totals or owner costs (hours/rate/pay stay empty).
 */
export async function syncScheduleCrewJobs(doc: CloudDoc) {
  if (!isUuid(doc.id)) return;
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return;
  const schedule = readSchedule(doc.data);
  // B1: derived schedules (a job/proposal with a date + time but no schedule block yet) reach crew too.
  const keep = schedule ? dedupeWorkerIds(schedule.workerIds).map((workerId) => `${doc.id}-sched-${workerId}`) : [];
  let stale = supabase.from("crew_jobs").delete().eq("owner_id", user.id).eq("doc_id", doc.id).like("id", `${doc.id}-sched-%`);
  if (keep.length) stale = stale.not("id", "in", `(${keep.map((id) => `"${id}"`).join(",")})`);
  await stale;
  if (!schedule || !keep.length) return;
  const workers = new Map(allEmployees().map((person) => [person.id, person]));
  const data = doc.data || {};
  const rows = dedupeWorkerIds(schedule.workerIds).map((workerId) => ({
      id: `${doc.id}-sched-${workerId}`,
      owner_id: user.id,
      employee_id: workerId,
      worker_name: workers.get(workerId)?.name || "",
      worker_email: workers.get(workerId)?.email || "",
      doc_id: doc.id,
      job_date: schedule.date,
      invoice_number: String(data.invoiceNumber || doc.title || ""),
      hours: "",
      rate: "",
      pay: 0,
      note: schedule.crewNote || "",
      client_name: String(data.clientName || doc.clientName || ""),
      client_phone: String(data.clientPhone || ""),
      client_email: String(data.clientEmail || ""),
      client_address: String(data.clientAddress || ""),
      status: String(data.status || "draft"),
      schedule_status: schedule.status,
      start_time: schedule.startTime,
      end_time: schedule.endTime || "",
      done_confirmed: schedule.status === "done" && Boolean(schedule.confirmedAt),
      on_my_way_at: schedule.onMyWayAt || "",
      checklist: schedule.checklist || [],
    }));
  let { error } = await supabase.from("crew_jobs").upsert(rows, { onConflict: "id" });
  // Before the checklist migration (20261016110000) runs, crew_jobs has no checklist column.
  if (error && /checklist/.test(error.message || "")) {
    ({ error } = await supabase.from("crew_jobs").upsert(rows.map(({ checklist: _skip, ...row }) => { void _skip; return row; }), { onConflict: "id" }));
  }
  // Before the on-my-way migration (110000) runs, crew_jobs has no on_my_way_at column: insert without it.
  if (error && /on_my_way_at/.test(error.message || "")) {
    ({ error } = await supabase.from("crew_jobs").upsert(rows.map(({ on_my_way_at: _skip, ...row }) => { void _skip; return row; }), { onConflict: "id" }));
  }
  // Before the done-photos migration runs, crew_jobs has no done_confirmed column: insert without it.
  if (error && /done_confirmed/.test(error.message || "")) {
    await supabase.from("crew_jobs").upsert(rows.map(({ done_confirmed: _skip, on_my_way_at: _skip2, ...row }) => { void _skip; void _skip2; return row; }), { onConflict: "id" });
  }
}

/** Done by the crew, not yet confirmed by the owner. */
export function awaitingConfirmation(schedule: Schedule | null) {
  return Boolean(schedule && schedule.status === "done" && !schedule.confirmedAt);
}

/** Crew: "On my way" for an assigned job (records time + their name for the owner; sends nothing). */
export async function crewOnMyWay(docId: string) {
  const { data, error } = await supabase.rpc("crew_on_my_way", { p_doc_id: docId });
  if (error) return error.message;
  return data === false ? "Could not update this job." : "";
}

/** Ready-to-send text for the customer (opened in the phone's messages app; never sent automatically). */
export function onMyWaySmsHref(phone: string, clientName: string, workerName: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return "";
  const first = clientName.trim().split(/\s+/)[0] || "there";
  const body = `Hi ${first}, this is ${workerName.trim() || "your crew"}. I'm on my way to you now.`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}

/** "9:05 AM" for an ISO time, in this device's zone. */
export function omwTime(iso: string) {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "" : time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Crew: mark an assigned job done; at least one photo (compressed JPEG data URL) is required. */
export async function crewMarkDone(docId: string, photos: string[], clientKey = "") {
  if (!photos.length) return "Add at least one photo of the finished job.";
  // With a client key the server skips an upload it already has (retry after a lost reply).
  let { data, error } = await supabase.rpc("crew_mark_done", clientKey ? { p_doc_id: docId, p_photos: photos, p_client_key: clientKey } : { p_doc_id: docId, p_photos: photos });
  if (error && clientKey && /could not find the function|PGRST202/i.test(`${error.message} ${(error as { code?: string }).code || ""}`)) {
    ({ data, error } = await supabase.rpc("crew_mark_done", { p_doc_id: docId, p_photos: photos })); // migration 20261016100000 not run yet
  }
  if (error) return error.message;
  return data === false ? "Could not mark this job done." : "";
}

/** Crew: tick or untick one checklist item on an assigned job (refused once the owner confirmed it). */
export async function crewCheckItem(docId: string, itemId: string, done: boolean) {
  const { data, error } = await supabase.rpc("crew_check_item", { p_doc_id: docId, p_item_id: itemId, p_done: done });
  if (error) return error.message;
  return data === false ? "Could not update the checklist." : "";
}

/** Owner: photos the crew attached when marking the job done (newest first). */
export async function jobDonePhotos(docId: string) {
  if (!isUuid(docId)) return [];
  const { data } = await supabase.from("crew_job_photos").select("id, worker_name, photo, created_at").eq("doc_id", docId).order("created_at", { ascending: false });
  return (data || []) as { id: string; worker_name: string; photo: string; created_at: string }[];
}

/**
 * Owner confirms a job the crew marked done. Reads the cloud schedule first (the crew's update
 * lands there), then saves it with confirmedAt. Only the schedule block changes.
 */
export async function confirmJobDone(docId: string) {
  let schedule = readSchedule(readDocs().find((doc) => doc.id === docId)?.data);
  if (isUuid(docId)) {
    const { data } = await supabase.from("documents").select("data").eq("id", docId).maybeSingle();
    const cloud = readSchedule((data?.data || undefined) as Record<string, unknown> | undefined);
    if (cloud && scheduleStamp(cloud) >= scheduleStamp(schedule)) schedule = cloud;
  }
  if (!schedule || schedule.status !== "done") return null;
  return saveSchedule(docId, { ...schedule, confirmedAt: new Date().toISOString() });
}

/** Crew: updates the status of a job they are assigned to (server checks the assignment). */
export async function crewSetJobStatus(docId: string, status: JobStatus) {
  const { error } = await supabase.rpc("crew_set_job_status", { p_doc_id: docId, p_status: status });
  return error ? error.message : "";
}

/** Minutes the owner wants between two jobs for the same person (drive time). */
export const TRAVEL_BUFFER_MINUTES = 30;
export type TravelWarning = { workerId: string; otherTitle: string; gap: number };

/**
 * Same person, same day: jobs that overlap or leave less than the travel buffer between them.
 * A job without an end time counts as one hour. Done jobs and this job (docId) are skipped. Warning only.
 */
export function travelWarnings(docId: string, date: string, startTime: string, endTime: string, workerIds: string[], buffer = TRAVEL_BUFFER_MINUTES): TravelWarning[] {
  if (!date || !startTime || !workerIds.length) return [];
  let docs: { id: string; title?: string; data?: Record<string, unknown> }[] = [];
  try {
    docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") || [];
  } catch {
    docs = [];
  }
  const start = minutes(startTime);
  const end = endTime ? minutes(endTime) : start + 60;
  const out: TravelWarning[] = [];
  for (const doc of docs) {
    if (!doc || doc.id === docId) continue;
    const other = readSchedule(doc.data);
    if (!other || other.date !== date || !other.startTime || other.status === "done") continue;
    const oStart = minutes(other.startTime);
    const oEnd = other.endTime ? minutes(other.endTime) : oStart + 60;
    const gap = oStart >= start ? oStart - end : start - oEnd;
    if (gap >= buffer) continue;
    for (const id of workerIds) if (other.workerIds.includes(id)) out.push({ workerId: id, otherTitle: doc.title || String(doc.data?.invoiceNumber || "another job"), gap });
  }
  return out;
}
