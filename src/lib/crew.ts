import { supabase } from "@/lib/supabase";

type CrewRow = {
  id: string;
  employeeId: string;
  name: string;
  rate: string;
  hours: string;
  note?: string;
  bonus?: string;
  workDate?: string;
  startTime?: string;
  endTime?: string;
};

function money(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export async function saveCrewJobs(
  docId: string,
  job: {
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
      job_date: row.workDate || "",
      invoice_number: job.invoiceNumber,
      hours: row.hours,
      rate: row.rate,
      pay: money(row.hours) * money(row.rate) + money(row.bonus || ""),
      note: row.note || "",
      client_name: job.clientName || "",
      client_phone: job.clientPhone || "",
      client_address: job.clientAddress || "",
      status: job.status || "draft",
      start_time: job.startTime || row.startTime || "",
      end_time: job.endTime || row.endTime || "",
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