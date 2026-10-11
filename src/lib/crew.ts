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
};

function money(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export async function saveCrewJobs(docId: string, invoiceNumber: string, crew: CrewRow[]) {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !docId) return;
  await supabase.from("crew_jobs").delete().eq("owner_id", user.id).eq("doc_id", docId);
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
      invoice_number: invoiceNumber,
      hours: row.hours,
      rate: row.rate,
      pay: money(row.hours) * money(row.rate) + money(row.bonus || ""),
      note: row.note || "",
    }))
  );
}

export async function isCrewUser() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return false;
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) return false;
  const { data: person } = await supabase.from("employees").select("id").ilike("email", user.email).limit(1);
  return Boolean(person && person.length);
}