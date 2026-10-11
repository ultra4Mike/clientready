"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Client = { id: string; name: string; phone: string; address: string };
type Job = { id: string; job_date: string; invoice_number: string; hours: string; rate: string; pay: number; note: string };
type Draft = {
  id: string;
  client_name: string;
  work_date: string;
  hours: string;
  work_done: string;
  status: string;
  collected_amount: string;
};

const empty = {
  clientName: "",
  clientPhone: "",
  clientAddress: "",
  workDone: "",
  workDate: "",
  startTime: "",
  endTime: "",
  hours: "",
  partsCost: "",
  partsNote: "",
  driveHours: "",
  driveMinutes: "",
  notes: "",
  finished: false,
  collectedAmount: "",
  collectedMethod: "cash",
};

function hoursBetween(start: string, end: string) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "";
  return (mins / 60).toFixed(2);
}

export default function CrewPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");

  async function load() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setEmail(user.email || "");
    const { data: person } = await supabase.from("employees").select("*").ilike("email", user.email || "").maybeSingle();
    if (person) {
      setName(person.name || "");
      setOwnerId(person.user_id || "");
      setEmployeeId(person.id || "");
      const { data: clientRows } = await supabase.from("clients").select("id, name, phone, address").eq("user_id", person.user_id);
      setClients((clientRows || []) as Client[]);
    }
    const { data: jobRows } = await supabase.from("crew_jobs").select("*").order("job_date", { ascending: false });
    setJobs((jobRows || []) as Job[]);
    const { data: draftRows } = await supabase.from("job_drafts").select("*").order("created_at", { ascending: false });
    setDrafts((draftRows || []) as Draft[]);
  }

  useEffect(() => {
    load();
  }, []);

  function pickClient(client: Client) {
    setForm({ ...form, clientName: client.name, clientPhone: client.phone || "", clientAddress: client.address || "" });
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!form.clientName.trim() || !ownerId) {
      setMessage("Add who the job was for.");
      return;
    }
    const hours = form.hours || hoursBetween(form.startTime, form.endTime);
    const { error } = await supabase.from("job_drafts").insert({
      id: Date.now().toString(),
      owner_id: ownerId,
      employee_id: employeeId,
      worker_name: name,
      worker_email: email,
      client_name: form.clientName,
      client_phone: form.clientPhone,
      client_address: form.clientAddress,
      work_done: form.workDone,
      work_date: form.workDate,
      start_time: form.startTime,
      end_time: form.endTime,
      hours,
      parts_cost: form.partsCost,
      parts_note: form.partsNote,
      drive_hours: form.driveHours,
      drive_minutes: form.driveMinutes,
      notes: form.notes,
      finished: form.finished,
      collected_amount: form.collectedAmount,
      collected_method: form.collectedMethod,
      status: "draft",
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm(empty);
    setOpen(false);
    setMessage("Job sent to the owner.");
    load();
  }

  const hoursTotal = jobs.reduce((sum, job) => sum + (Number(job.hours) || 0), 0);
  const payTotal = jobs.reduce((sum, job) => sum + (Number(job.pay) || 0), 0);

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] px-4 py-8 text-[var(--cr-text)]">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{name || "Your jobs"}</h1>
          <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} className="text-sm">Log out</button>
        </div>
        <p className="mt-2 text-sm text-[var(--cr-muted)]">Record the job. Owner costs and profit are not on this page.</p>
        <button type="button" onClick={() => setOpen(!open)} className="mt-4 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">
          {open ? "Close" : "New job"}
        </button>
        {message && <p className="mt-3 text-sm">{message}</p>}

        {open && (
          <form onSubmit={saveDraft} className="mt-4 space-y-3 rounded-2xl border border-teal-500/20 p-4">
            <select className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); if (client) pickClient(client); }}>
              <option value="">Pick a saved client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Who it was for" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} />
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Phone" value={form.clientPhone} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} />
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Address" value={form.clientAddress} onChange={(event) => setForm({ ...form, clientAddress: event.target.value })} />
            <textarea className="min-h-20 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="What was done" value={form.workDone} onChange={(event) => setForm({ ...form, workDone: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Date<input type="date" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /></label>
              <label className="text-sm">Hours<input className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
              <label className="text-sm">Start<input type="time" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value, hours: hoursBetween(event.target.value, form.endTime) || form.hours })} /></label>
              <label className="text-sm">End<input type="time" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value, hours: hoursBetween(form.startTime, event.target.value) || form.hours })} /></label>
              <label className="text-sm">Parts you bought<input className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Cost" value={form.partsCost} onChange={(event) => setForm({ ...form, partsCost: event.target.value })} /></label>
              <label className="text-sm">Drive time
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Hours" value={form.driveHours} onChange={(event) => setForm({ ...form, driveHours: event.target.value })} />
                  <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Minutes" value={form.driveMinutes} onChange={(event) => setForm({ ...form, driveMinutes: event.target.value })} />
                </div>
              </label>
            </div>
            <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="What the parts were" value={form.partsNote} onChange={(event) => setForm({ ...form, partsNote: event.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Collected from customer" value={form.collectedAmount} onChange={(event) => setForm({ ...form, collectedAmount: event.target.value })} />
              <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={form.collectedMethod} onChange={(event) => setForm({ ...form, collectedMethod: event.target.value })}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </div>
            <textarea className="min-h-16 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.finished} onChange={(event) => setForm({ ...form, finished: event.target.checked })} />
              Job is finished
            </label>
            <button type="submit" className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">Send to owner</button>
          </form>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-teal-500/20 p-4"><p className="text-sm text-[var(--cr-muted)]">Hours</p><p className="mt-1 text-2xl font-semibold">{hoursTotal.toFixed(2)}</p></div>
          <div className="rounded-2xl border border-teal-500/20 p-4"><p className="text-sm text-[var(--cr-muted)]">Your pay</p><p className="mt-1 text-2xl font-semibold">${payTotal.toFixed(2)}</p></div>
        </div>

        <h2 className="mt-8 font-semibold">Jobs you sent</h2>
        <div className="mt-3 space-y-3">
          {drafts.length === 0 && <p className="text-sm text-[var(--cr-muted)]">None yet.</p>}
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-2xl border border-teal-500/20 p-4">
              <p className="font-medium">{draft.client_name}</p>
              <p className="text-sm text-[var(--cr-muted)]">{draft.work_date || "No date"} · {draft.hours || "0"} hrs · {draft.status}</p>
              <p className="mt-1 text-sm">{draft.work_done}</p>
            </div>
          ))}
        </div>

<h2 className="mt-8 font-semibold">Approved pay</h2>
        <div className="mt-3 space-y-3">
          {jobs.length === 0 && <p className="text-sm text-[var(--cr-muted)]">No approved jobs yet.</p>}
          {jobs.map((job) => (
            <details key={job.id} className="rounded-2xl border border-teal-500/20 p-4">
              <summary className="cursor-pointer font-medium">{job.invoice_number || "Job"} · ${Number(job.pay || 0).toFixed(2)}</summary>
              <p className="mt-2 text-sm text-[var(--cr-muted)]">{job.job_date || "No date"} · {job.hours || "0"} hrs · ${Number(job.rate || 0).toFixed(2)}/hr</p>
              <p className="mt-1 font-semibold">${Number(job.pay || 0).toFixed(2)}</p>
              {job.note && <p className="mt-1 text-sm">{job.note}</p>}
              <p className="mt-2 text-xs text-[var(--cr-muted)]">Your pay record. The owner invoice stays with the owner.</p>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}