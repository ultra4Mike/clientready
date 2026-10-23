import { rowPayMoney, type PayType } from "@/lib/pay-types";
import { supabase } from "@/lib/supabase";
import { holdsSchedule } from "@/lib/change-order-revision";

/**
 * Change-order revisions: a version that doesn't hold the job (a draft change order, or a version replaced by a
 * sent one) mirrors only rows with work already logged (hours, clock time or paid), so the crew view never
 * lists the job twice and recorded pay stays where it was earned.
 */
export function crewRowsFor<T extends { hours?: string; paidToWorker?: boolean; clockMinutes?: number }>(holds: boolean, crew: T[]) {
  if (holds) return crew;
  return crew.filter((row) => row.paidToWorker || (Number(row.clockMinutes) || 0) > 0 || (Number(String(row.hours || "").replace(/[^0-9.]/g, "")) || 0) > 0);
}
function mirroredCrewRows<T extends { hours?: string; paidToWorker?: boolean; clockMinutes?: number }>(docId: string, crew: T[]) {
  try {
    const docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as { id: string; type?: string; data?: Record<string, unknown> }[];
    const doc = docs.find((d) => d.id === docId);
    return doc ? crewRowsFor(holdsSchedule(docs, doc), crew) : crew;
  } catch { return crew; }
}

type CrewRow = {
  id: string;
  employeeId: string;
  name: string;
  rate: string;
  hours: string;
  note?: string;
  bonus?: string;
  workDate?: string;
  paidToWorker?: boolean;
  hoursFromClock?: boolean;
  clockMinutes?: number;
  payType?: PayType;
  fixedPay?: string;
  payOverride?: string;
  startTime?: string;
  endTime?: string;
};

export async function saveCrewJobs(
  docId: string,
  job: {
    /** The schedule's date: crew rows follow it (rows already paid to the worker keep their date). */
    date?: string;
    invoiceNumber: string;
    clientName?: string;
    clientPhone?: string;
    clientAddress?: string;
    status?: string;
    startTime?: string;
    endTime?: string;
  },
  crew: CrewRow[]
) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !docId) return;
  crew = mirroredCrewRows(docId, crew);
  // Pay rows only: schedule rows ("<doc>-sched-<worker>") are kept in step by syncScheduleCrewJobs.
  await supabase.from("crew_jobs").delete().eq("owner_id", user.id).eq("doc_id", docId).not("id", "like", `${docId}-sched-%`);
  if (!crew.length) return;
  const { data: people } = await supabase.from("employees").select("id, email").eq("user_id", user.id);
  const emailById = new Map((people || []).map((person) => [person.id, person.email || ""]));
  await supabase.from("crew_jobs").insert(
    crew.map((row) => ({
      id: `${docId}-${row.id}`,
      owner_id: user.id,
      employee_id: row.employeeId,
      worker_name: row.name,
      worker_email: emailById.get(row.employeeId) || "",
      doc_id: docId,
      // Rows arrive already following the schedule (multi-day rows keep their own day).
      job_date: (row.paidToWorker ? row.workDate : row.workDate || job.date) || "",
      invoice_number: job.invoiceNumber,
      hours: row.hours,
      rate: row.rate,
      pay: rowPayMoney(row),
      note: row.note || "",
      client_name: job.clientName || "",
      client_phone: job.clientPhone || "",
      client_address: job.clientAddress || "",
      status: job.status || "draft",
      start_time: (row.paidToWorker ? row.startTime : job.startTime) || row.startTime || "",
      end_time: (row.paidToWorker ? row.endTime : job.endTime) || row.endTime || "",
    }))
  );
}

export async function isCrewUser() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return false;
  const { data: person } = await supabase.rpc("is_crew_email");
  const row = Array.isArray(person) ? person[0] : person;
  return Boolean(row && row.user_id && row.user_id !== user.id);
}