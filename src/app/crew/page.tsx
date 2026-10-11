"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client = { id: string; name: string; phone: string; address: string };
type Job = {
  id: string;
  doc_id: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  job_date: string;
  start_time: string;
  end_time: string;
  invoice_number: string;
  hours: string;
  rate: string;
  pay: number;
  note: string;
  status: string;
};
type Expense = { id: string; doc_id: string; kind: string; amount: string; note: string };
type Draft = { id: string; client_name: string; work_date: string; hours: string; work_done: string; status: string };

const empty = {
  clientName: "", clientPhone: "", clientAddress: "", workDone: "", workDate: "",
  startTime: "", endTime: "", hours: "", partsCost: "", partsNote: "",
  driveHours: "", driveMinutes: "", notes: "", finished: false, collectedAmount: "", collectedMethod: "cash",
};

function hoursBetween(start: string, end: string) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : "";
}

export default function CrewPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [spend, setSpend] = useState<Record<string, { kind: string; amount: string; note: string }>>({});

  async function load() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return (window.location.href = "/login");
    setEmail(user.email || "");
    const { data: person } = await supabase.rpc("is_crew_email");
    const row = Array.isArray(person) ? person[0] : person;
    if (row) {
      setEmployeeId(row.id || "");
      setOwnerId(row.user_id || "");
    }
    const { data: employee } = await supabase.from("employees").select("name").ilike("email", user.email || "").maybeSingle();
    setName(employee?.name || user.email || "");
    const { data: clientRows } = await supabase.rpc("list_crew_clients");
    setClients((clientRows || []) as Client[]);
    const { data: jobRows } = await supabase.from("crew_jobs").select("*").order("job_date", { ascending: true });
    setJobs((jobRows || []) as Job[]);
    const { data: draftRows } = await supabase.from("job_drafts").select("*").order("created_at", { ascending: false });
    setDrafts((draftRows || []) as Draft[]);
    const { data: spendRows } = await supabase.from("crew_expenses").select("*").order("created_at", { ascending: false });
    setExpenses((spendRows || []) as Expense[]);
  }

  useEffect(() => { load(); }, []);

  function pickClient(client: Client) {
    setForm({ ...form, clientName: client.name, clientPhone: client.phone || "", clientAddress: client.address || "" });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!form.clientName.trim() || !ownerId) return setMessage("Add who the job was for.");
    const { error } = await supabase.from("job_drafts").insert({
      id: Date.now().toString(), owner_id: ownerId, employee_id: employeeId, worker_name: name, worker_email: email,
      client_name: form.clientName, client_phone: form.clientPhone, client_address: form.clientAddress,
      work_done: form.workDone, work_date: form.workDate, start_time: form.startTime, end_time: form.endTime,
      hours: form.hours || hoursBetween(form.startTime, form.endTime), parts_cost: form.partsCost, parts_note: form.partsNote,
      drive_hours: form.driveHours, drive_minutes: form.driveMinutes, notes: form.notes, finished: form.finished,
      collected_amount: form.collectedAmount, collected_method: form.collectedMethod, status: "draft",
    });
    if (error) return setMessage(error.message);
    setForm(empty);
    setOpen(false);
    setMessage("Job report sent. The owner will review it.");
    load();
  }

  async function addSpend(job: Job) {
    const row = spend[job.id] || { kind: "parts", amount: "", note: "" };
    if (!row.amount.trim()) return setMessage("Add the amount you spent.");
    const { error } = await supabase.from("crew_expenses").insert({
      id: Date.now().toString(), owner_id: ownerId, doc_id: job.doc_id, worker_email: email, worker_name: name,
      kind: row.kind, amount: row.amount, note: row.note,
    });
    if (error) return setMessage(error.message);
    setSpend({ ...spend, [job.id]: { kind: "parts", amount: "", note: "" } });
    setMessage("Expense added to this job.");
    load();
  }

  const paid = jobs.filter((job) => job.status === "paid");
  const confirmedPay = paid.reduce((sum, job) => sum + (Number(job.pay) || 0), 0);
  const confirmedHours = paid.reduce((sum, job) => sum + (Number(job.hours) || 0), 0);
  const upcoming = jobs.filter((job) => job.status !== "paid");

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] px-4 py-8 text-[var(--cr-text)]">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{name || "Your jobs"}</h1>
          <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} className="text-sm">Log out</button>
        </div>
        <p className="mt-2 text-sm text-[var(--cr-muted)]">Your schedule, the client, and what you spent. Company profit is not on this page.</p>
        <button type="button" onClick={() => setOpen(!open)} className="mt-4 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">{open ? "Close" : "New job report"}</button>
        {message && <p className="mt-3 text-sm">{message}</p>}

        {open && (
          <form onSubmit={saveDraft} className="mt-4 space-y-3 rounded-2xl border border-teal-500/20 p-4">
            <select className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); if (client) pickClient(client); }}>
              <option value="">Pick a client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Who it was for" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} />
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Phone" value={form.clientPhone} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} />
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Address" value={form.clientAddress} onChange={(event) => setForm({ ...form, clientAddress: event.target.value })} />
            <textarea className="min-h-20 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="What was done" value={form.workDone} onChange={(event) => setForm({ ...form, workDone: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Date<input type="date" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /></label>
              <label className="text-sm">Hours<input className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
              <label className="text-sm">Start<input type="time" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
              <label className="text-sm">End<input type="time" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
            </div>
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Parts, gas, or dump fee you paid" value={form.partsCost} onChange={(event) => setForm({ ...form, partsCost: event.target.value })} />
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="What it was" value={form.partsNote} onChange={(event) => setForm({ ...form, partsNote: event.target.value })} />
            <textarea className="min-h-16 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.finished} onChange={(event) => setForm({ ...form, finished: event.target.checked })} /> Job is finished</label>
            <button type="submit" className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">Send job report</button>
          </form>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-teal-500/20 p-4"><p className="text-sm text-[var(--cr-muted)]">Paid hours</p><p className="mt-1 text-2xl font-semibold">{confirmedHours.toFixed(2)}</p></div>
          <div className="rounded-2xl border border-teal-500/20 p-4"><p className="text-sm text-[var(--cr-muted)]">Confirmed pay</p><p className="mt-1 text-2xl font-semibold">${confirmedPay.toFixed(2)}</p></div>
        </div>
        <p className="mt-2 text-xs text-[var(--cr-muted)]">Confirmed pay is only jobs marked paid. A scheduled job is not pay yet.</p>

        <h2 className="mt-8 font-semibold">Your week</h2>
        <div className="mt-3 space-y-3">
          {jobs.length === 0 && <p className="text-sm text-[var(--cr-muted)]">No jobs on your schedule.</p>}
          {jobs.map((job) => (
            <div key={job.id} className="rounded-2xl border border-teal-500/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{job.client_name || job.invoice_number || "Job"}</p>
                <p className="text-xs uppercase text-[var(--cr-muted)]">{job.status || "draft"}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--cr-muted)]">{job.job_date || "No date"} · {job.start_time || "no time"} to {job.end_time || "no time"} · {job.hours || "0"} hrs</p>
              {job.client_phone && <p className="text-sm">{job.client_phone}</p>}
              {job.client_address && <p className="text-sm">{job.client_address}</p>}
              <p className="mt-1 text-sm">{job.status === "paid" ? `Pay $${Number(job.pay || 0).toFixed(2)}` : "Pay not confirmed"}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm" value={spend[job.id]?.kind || "parts"} onChange={(event) => setSpend({ ...spend, [job.id]: { ...(spend[job.id] || { amount: "", note: "" }), kind: event.target.value } })}>
                  <option value="gas">Gas</option><option value="parts">Parts</option><option value="dump">Dump fee</option><option value="other">Other</option>
                </select>
                <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm" placeholder="Amount" value={spend[job.id]?.amount || ""} onChange={(event) => setSpend({ ...spend, [job.id]: { ...(spend[job.id] || { kind: "parts", note: "" }), amount: event.target.value } })} />
                <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm" placeholder="What broke or what you bought" value={spend[job.id]?.note || ""} onChange={(event) => setSpend({ ...spend, [job.id]: { ...(spend[job.id] || { kind: "parts", amount: "" }), note: event.target.value } })} />
              </div>
              <button type="button" onClick={() => addSpend(job)} className="mt-2 text-sm font-medium">Add expense to this job</button>
              {expenses.filter((item) => item.doc_id === job.doc_id).map((item) => (
                <p key={item.id} className="mt-1 text-sm text-[var(--cr-muted)]">{item.kind} · ${item.amount} · {item.note}</p>
              ))}
            </div>
          ))}
        </div>

        <h2 className="mt-8 font-semibold">Reports you sent</h2>
        <div className="mt-3 space-y-3">
          {drafts.length === 0 && <p className="text-sm text-[var(--cr-muted)]">None yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-2xl border border-teal-500/20 p-4">
              <p className="font-medium">{draft.client_name}</p>
              <p className="text-sm text-[var(--cr-muted)]">{draft.work_date || "No date"} · {draft.hours || "0"} hrs · waiting on owner</p>
              <p className="mt-1 text-sm">{draft.work_done}</p>
            </div>
          ))}
        </div>
        {upcoming.length > 0 && <p className="mt-6 text-xs text-[var(--cr-muted)]">{upcoming.length} job{upcoming.length === 1 ? "" : "s"} still not marked paid.</p>}
      </div>
    </main>
  );
}