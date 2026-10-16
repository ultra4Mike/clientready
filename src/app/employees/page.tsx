"use client";

import EmptyState from "@/components/EmptyState";
import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";

type RateChange = { rate: string; effectiveDate: string };

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  kind: "employee" | "contractor";
  rate: string;
  hireDate: string;
  active: boolean;
  rateHistory: RateChange[];
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  role: "",
  kind: "employee" as "employee" | "contractor",
  rate: "",
  hireDate: "",
};

function fromRow(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    role: String(row.role || ""),
    kind: row.kind === "contractor" ? "contractor" : "employee",
    rate: String(row.rate || ""),
    hireDate: String(row.hire_date || ""),
    active: row.active !== false,
    rateHistory: Array.isArray(row.rate_history) ? (row.rate_history as RateChange[]) : [],
  };
}

function toRow(person: Employee, userId: string) {
  return {
    user_id: userId,
    id: person.id,
    name: person.name,
    email: person.email,
    phone: person.phone,
    role: person.role,
    kind: person.kind,
    rate: person.rate,
    hire_date: person.hireDate,
    active: person.active,
    rate_history: person.rateHistory,
  };
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [raiseRate, setRaiseRate] = useState("");
  const [raiseDate, setRaiseDate] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    async function load() {
      const raw = window.localStorage.getItem("clientready-employees");
      if (raw) setEmployees(JSON.parse(raw));
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      setUserId(user.id);
      const { data: rows, error } = await supabase.from("employees").select("*").eq("user_id", user.id);
      if (error) {
        setMessage("Cloud load failed: " + error.message);
        return;
      }
      const next = (rows || []).map((row) => fromRow(row));
      setEmployees(next);
      window.localStorage.setItem("clientready-employees", JSON.stringify(next));
    }
    load();
  }, []);

  function saveLocal(next: Employee[]) {
    setEmployees(next);
    window.localStorage.setItem("clientready-employees", JSON.stringify(next));
  }

  async function saveCloud(person: Employee) {
    if (!userId) return;
    const { error } = await supabase.from("employees").upsert(toRow(person, userId));
    if (error) setMessage("Saved on this computer. Cloud save failed: " + error.message);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.rate.trim()) {
      setMessage("Name and hourly rate are required.");
      return;
    }
    if (editingId) {
      const current = employees.find((person) => person.id === editingId);
      const nextPerson: Employee = {
        ...(current as Employee),
        ...form,
        email: form.email.trim().toLowerCase(),
        rateHistory: current?.rateHistory || [],
      };
      const next = employees.map((person) => (person.id === editingId ? nextPerson : person));
      saveLocal(next);
      await saveCloud(nextPerson);
      setEditingId("");
      setForm(emptyForm);
      setMessage("Employee updated. Past jobs were not changed.");
      return;
    }
    const person: Employee = {
      id: Date.now().toString(),
      ...form,
      email: form.email.trim().toLowerCase(),
      active: true,
      rateHistory: [{ rate: form.rate, effectiveDate: form.hireDate || new Date().toISOString().slice(0, 10) }],
    };
    saveLocal([...employees, person]);
    await saveCloud(person);
    setForm(emptyForm);
    setMessage("Employee saved. They sign up with that email.");
  }

  function edit(person: Employee) {
    setEditingId(person.id);
    setForm({
      name: person.name,
      email: person.email,
      phone: person.phone,
      role: person.role,
      kind: person.kind,
      rate: person.rate,
      hireDate: person.hireDate,
    });
    setRaiseRate("");
    setRaiseDate("");
  }

  async function giveRaise(person: Employee) {
    if (!raiseRate.trim() || !raiseDate) {
      setMessage("A raise needs a new rate and the date it starts.");
      return;
    }
    const nextPerson: Employee = {
      ...person,
      rate: raiseRate,
      rateHistory: [...person.rateHistory, { rate: raiseRate, effectiveDate: raiseDate }],
    };
    const next = employees.map((item) => (item.id === person.id ? nextPerson : item));
    saveLocal(next);
    await saveCloud(nextPerson);
    setRaiseRate("");
    setRaiseDate("");
    setMessage("Raise saved for new jobs only. Older invoices stay at the old rate.");
  }

  async function setActive(person: Employee, active: boolean) {
    const nextPerson = { ...person, active };
    saveLocal(employees.map((item) => (item.id === person.id ? nextPerson : item)));
    await saveCloud(nextPerson);
  }

  async function remove(person: Employee) {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const used = docs.some((doc: { data?: { crew?: { employeeId?: string }[] } }) =>
      (doc.data?.crew || []).some((row) => row.employeeId === person.id)
    );
    if (used) {
      setMessage("This person is on a saved job. Mark them inactive instead.");
      return;
    }
    const ok = window.confirm("Are you sure you want to delete this employee?");
    if (!ok) return;
    saveLocal(employees.filter((item) => item.id !== person.id));
    if (userId) await supabase.from("employees").delete().eq("user_id", userId).eq("id", person.id);
  }

  return (
    <AppShell title="Team">
      <PageHeader title="Team" subtitle="Add the email they will use to log in. That email opens the crew page, not the owner books." />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
      <div className="order-2 min-w-0 lg:order-none lg:sticky lg:top-20">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Add or edit a person</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-teal-500/20 p-4 [&>input]:w-full [&>select]:w-full">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-500">Person & role</h2>
        <input name="name" autoComplete="name" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input name="email" autoComplete="email" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Email they will use to log in" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input name="phone" autoComplete="tel" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input name="role" autoComplete="off" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
        <select name="kind" aria-label="Worker type" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as "employee" | "contractor" })}>
          <option value="employee">Employee</option>
          <option value="contractor">Contractor</option>
        </select>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-teal-500/20 p-4 min-[360px]:grid-cols-2 [&>*]:min-w-0">
          <h2 className="col-span-full text-xs font-semibold uppercase tracking-wide text-teal-500">Pay & start date</h2>
        <label className="block min-w-0 text-sm font-medium">
          Hourly rate
          <input name="rate" autoComplete="off" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="24" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Hire date
          <input type="date" name="hireDate" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.hireDate} onChange={(event) => setForm({ ...form, hireDate: event.target.value })} />
        </label>
        </div>
        <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:self-end sm:px-8">
          {editingId ? "Update employee" : "Save employee"}
        </button>
        <p className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-medium text-[var(--cr-text)]">🔒 No Social Security number, bank account, or routing number.</p>
      </form>
      {message && <p className="mt-3 rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-[var(--cr-muted)]">{message}</p>}

      </div>
      <div className="order-1 min-w-0 lg:order-none">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">People ({employees.length})</h2>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {employees.length === 0 && <EmptyState icon="👥" title="No employees yet." line="Add a person with the form to track crew hours and pay." className="rounded-2xl border border-dashed border-teal-500/30 lg:col-span-2" />}
        {employees.map((person) => (
          <div key={person.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
            <p className="text-base font-semibold">{person.name} <span className="font-medium text-teal-600 dark:text-teal-300">· ${Number(person.rate || 0).toFixed(2)}/hr</span></p>
            <p className="text-sm text-[var(--cr-muted)]">
              {person.kind} · {person.role || "No role"} · {person.active ? "Active" : "Inactive"}
              {person.hireDate ? <> · <span className="whitespace-nowrap">hired {person.hireDate}</span></> : ""}
            </p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">{person.email || "No login email"}</p>
            <p className="text-sm text-[var(--cr-muted)]">{person.phone}</p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-teal-500/10 pt-3">
              <button type="button" onClick={() => edit(person)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400 max-sm:min-h-11">Edit</button>
              <button type="button" onClick={() => setActive(person, !person.active)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400 max-sm:min-h-11">
                {person.active ? "Mark inactive" : "Mark active"}
              </button>
              <button type="button" onClick={() => remove(person)} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 max-sm:min-h-11 dark:text-rose-300">Remove</button>
            </div>
            <details className="group/raise mt-4 rounded-xl border border-teal-500/15 bg-teal-500/5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">Give raise<span aria-hidden="true" className="text-[var(--cr-muted)] transition group-open/raise:rotate-90">›</span></summary>
            <div className="flex flex-wrap gap-3 border-t border-teal-500/15 p-3 sm:p-4">
              <input name={`raise-rate-${person.id}`} aria-label={`New rate for ${person.name}`} autoComplete="off" className="min-w-0 flex-1 basis-32 rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="New rate" value={editingId === person.id ? raiseRate : ""} onChange={(event) => { setEditingId(person.id); setRaiseRate(event.target.value); }} />
              <input type="date" name={`raise-date-${person.id}`} aria-label={`Raise start date for ${person.name}`} className="min-w-0 flex-1 basis-36 rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={editingId === person.id ? raiseDate : ""} onChange={(event) => { setEditingId(person.id); setRaiseDate(event.target.value); }} />
              <button type="button" onClick={() => giveRaise(person)} className="w-full shrink-0 whitespace-nowrap rounded-lg sm:w-auto border border-teal-500/40 px-3 py-2.5 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10">Save raise</button>
            </div>
            </details>
          </div>
        ))}
      </div>
      </div>
      </div>
    </AppShell>
  );
}