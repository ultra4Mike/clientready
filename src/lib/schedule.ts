import { supabase } from "@/lib/supabase";
import { isUuid, saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";
import { moneySnapshot } from "@/lib/change-orders";

export type JobStatus = "scheduled" | "in_progress" | "done";
export type Schedule = {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime?: string;
  workerIds: string[];
  status: JobStatus;
  updatedAt: string;
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
    };
  }
  if (data?.jobTime && isDate(data?.dueDate)) {
    return { date: String(data.dueDate), startTime: parseLegacyTime(data.jobTime), workerIds: [], status: "scheduled", updatedAt: "" };
  }
  return null;
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
export function crewForWorkers(crew: CrewRow[], workerIds: string[], schedule: Pick<Schedule, "date" | "startTime" | "endTime"> | null, people: Worker[] = allEmployees()) {
  const keep = new Set(workerIds);
  const kept = crew.filter((row) => keep.has(row.employeeId));
  const have = new Set(kept.map((row) => row.employeeId));
  const byId = new Map(people.map((person) => [person.id, person]));
  const added = workerIds.filter((id) => !have.has(id)).map((id) => ({
    id: `crew-${id}`, employeeId: id, name: byId.get(id)?.name || "Worker", rate: byId.get(id)?.rate || "",
    hours: "", startTime: schedule?.startTime || "", endTime: schedule?.endTime || "", workDate: schedule?.date || "",
    note: "", bonus: "", paidToWorker: false, paidDate: "",
  }));
  return [...kept, ...added];
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
export function applySchedule<T extends CloudDoc>(docs: T[], docId: string, schedule: Schedule | null) {
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
  if (moneyExceptCrew(updated.data) !== before) throw new Error("Schedule change would touch money fields");
  const keptBefore = new Map(crew.map((row) => [row.id, JSON.stringify(row)]));
  for (const row of (updated.data.crew || []) as CrewRow[]) {
    if (keptBefore.has(row.id) && keptBefore.get(row.id) !== JSON.stringify(row)) throw new Error("Schedule change would edit crew pay");
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
export async function saveAssignment(docId: string, workerIds: string[]) {
  const doc = readDocs().find((item) => item.id === docId);
  if (!doc) return null;
  const current = (doc.data?.schedule ? readSchedule(doc.data) : null);
  if (current) return saveSchedule(docId, { ...current, workerIds });
  const before = moneyExceptCrew(doc.data);
  const ids = dedupeWorkerIds(workerIds);
  const crew = (Array.isArray(doc.data?.crew) ? doc.data.crew : []) as CrewRow[];
  const next: CloudDoc = { ...doc, data: { ...(doc.data || {}), crew: crewForWorkers(crew, ids, null) } };
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
  await saveCrewJobs(doc.id, {
    invoiceNumber: String(data.invoiceNumber || doc.title || ""),
    clientName: String(data.clientName || ""),
    clientPhone: String(data.clientPhone || ""),
    clientAddress: String(data.clientAddress || ""),
    status: String(data.status || ""),
    startTime: String(data.jobStart || ""),
    endTime: String(data.jobEnd || ""),
  }, (Array.isArray(data.crew) ? data.crew : []) as CrewRow[]);
}

export async function saveSchedule(docId: string, schedule: Schedule | null) {
  const applied = applySchedule(readDocs(), docId, schedule);
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
  await supabase.from("crew_jobs").delete().eq("owner_id", user.id).eq("doc_id", doc.id).like("id", `${doc.id}-sched-%`);
  if (!schedule || !doc.data?.schedule || !schedule.workerIds.length) return;
  const workers = new Map(allEmployees().map((person) => [person.id, person]));
  const data = doc.data || {};
  await supabase.from("crew_jobs").insert(
    dedupeWorkerIds(schedule.workerIds).map((workerId) => ({
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
      note: "",
      client_name: String(data.clientName || doc.clientName || ""),
      client_phone: String(data.clientPhone || ""),
      client_email: String(data.clientEmail || ""),
      client_address: String(data.clientAddress || ""),
      status: String(data.status || "draft"),
      schedule_status: schedule.status,
      start_time: schedule.startTime,
      end_time: schedule.endTime || "",
    })),
  );
}

/** Crew: updates the status of a job they are assigned to (server checks the assignment). */
export async function crewSetJobStatus(docId: string, status: JobStatus) {
  const { error } = await supabase.rpc("crew_set_job_status", { p_doc_id: docId, p_status: status });
  return error ? error.message : "";
}
