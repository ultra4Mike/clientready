"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
    <AppShell title="Employees">
      <p className="text-sm text-[var(--cr-muted)] sm:text-base">
        Add the email they will use to log in. That email opens the crew page, not the owner books.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6 md:grid-cols-2">
        <div className="grid gap-3 rounded-xl border border-teal-500/20 p-4 md:col-span-2 md:grid-cols-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-500 md:col-span-2">Person & role</h2>
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Email they will use to log in" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
        <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as "employee" | "contractor" })}>
          <option value="employee">Employee</option>
          <option value="contractor">Contractor</option>
        </select>
        </div>
        <div className="grid gap-3 rounded-xl border border-teal-500/20 p-4 md:col-span-2 md:grid-cols-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-500 md:col-span-2">Pay & start date</h2>
        <label className="text-sm font-medium">
          Hourly rate
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="24" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
        </label>
        <label className="text-sm font-medium">
          Hire date
          <input type="date" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.hireDate} onChange={(event) => setForm({ ...form, hireDate: event.target.value })} />
        </label>
        </div>
        <button type="submit" className="rounded-lg bg-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-300 md:col-span-2 md:justify-self-end md:px-8">
          {editingId ? "Update employee" : "Save employee"}
        </button>
        <p className="text-xs text-[var(--cr-muted)] md:col-span-2 md:text-right">No Social Security number, bank account, or routing number.</p>
      </form>
      {message && <p className="mt-3 rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-[var(--cr-muted)]">{message}</p>}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Team</h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {employees.length === 0 && <p className="rounded-2xl border border-dashed border-teal-500/30 p-8 text-center text-sm text-[var(--cr-muted)] lg:col-span-2">No employees yet.</p>}
        {employees.map((person) => (
          <div key={person.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
            <p className="text-base font-semibold">{person.name} <span className="font-medium text-teal-600 dark:text-teal-300">· ${Number(person.rate || 0).toFixed(2)}/hr</span></p>
            <p className="text-sm text-[var(--cr-muted)]">
              {person.kind} · {person.role || "No role"} · {person.active ? "Active" : "Inactive"}
              {person.hireDate ? ` · hired ${person.hireDate}` : ""}
            </p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">{person.email || "No login email"}</p>
            <p className="text-sm text-[var(--cr-muted)]">{person.phone}</p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-teal-500/10 pt-3">
              <button type="button" onClick={() => edit(person)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400">Edit</button>
              <button type="button" onClick={() => setActive(person, !person.active)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400">
                {person.active ? "Mark inactive" : "Mark active"}
              </button>
              <button type="button" onClick={() => remove(person)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--cr-muted)] transition hover:bg-red-500/10 hover:text-red-500">Remove</button>
            </div>
            <div className="mt-4 grid gap-2 rounded-xl bg-teal-500/5 p-3 sm:grid-cols-3">
              <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="New rate" value={editingId === person.id ? raiseRate : ""} onChange={(event) => { setEditingId(person.id); setRaiseRate(event.target.value); }} />
              <input type="date" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={editingId === person.id ? raiseDate : ""} onChange={(event) => { setEditingId(person.id); setRaiseDate(event.target.value); }} />
              <button type="button" onClick={() => giveRaise(person)} className="rounded-lg border border-teal-500/40 px-3 py-2.5 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10">Save raise</button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}