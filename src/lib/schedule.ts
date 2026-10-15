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
export type Worker = { id: string; name: string; email?: string; phone?: string; active?: boolean };

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
 * Replaces only data.schedule on the stored doc (null clears it). Throws if any money,
 * status or payment field would change. Returns the updated doc, or null if not found.
 */
export function applySchedule<T extends CloudDoc>(docs: T[], docId: string, schedule: Schedule | null) {
  const index = docs.findIndex((doc) => doc.id === docId);
  if (index < 0) return null;
  const doc = docs[index];
  const before = moneySnapshot(doc.data);
  const data: Record<string, unknown> = { ...(doc.data || {}) };
  if (schedule) data.schedule = { ...schedule, updatedAt: new Date().toISOString() };
  else delete data.schedule;
  const updated = { ...doc, data } as T;
  if (moneySnapshot(updated.data) !== before) throw new Error("Schedule change would touch money fields");
  const next = [...docs];
  next[index] = updated;
  return { docs: next, doc: updated };
}

/** Saves a schedule change locally and to the account, then refreshes the crew's job list. */
export async function saveSchedule(docId: string, schedule: Schedule | null) {
  const applied = applySchedule(readDocs(), docId, schedule);
  if (!applied) return null;
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(applied.docs));
  const cloudId = await saveCloudDocument(applied.doc);
  // saveCloudDocument may adopt the cloud's approval/schedule and stamps updatedAt: store that copy.
  const latest = readDocs().map((doc) => (doc.id === docId ? { ...applied.doc, id: cloudId } : doc));
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(latest));
  await syncScheduleCrewJobs({ ...applied.doc, id: cloudId });
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
  const workers = new Map(readWorkers().map((person) => [person.id, person]));
  const data = doc.data || {};
  await supabase.from("crew_jobs").insert(
    schedule.workerIds.map((workerId) => ({
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
