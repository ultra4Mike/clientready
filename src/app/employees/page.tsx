"use client";

import { inviteText } from "@/lib/crew-invite";
import { mailtoHref } from "@/lib/reminders";

import TimesheetExport from "@/components/TimesheetExport";
import TimesheetRules from "@/components/timesheet/TimesheetRules";
import EmptyState from "@/components/EmptyState";
import { FormEvent, useEffect, useState } from "react";
import FormDraft from "@/components/FormDraft";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ScheduleReconcile from "@/components/ScheduleReconcile";
import { supabase } from "@/lib/supabase";
import { readWorkerOverrides, timeOverridesRow, type WorkerTimeOverrides } from "@/lib/timesheet";
import { DEFAULT_PAY, payLabel, payProblem, readPaySettings, type PaySettings } from "@/lib/pay-types";

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
  paySettings?: PaySettings;
  timeOverrides?: WorkerTimeOverrides;
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  role: "",
  kind: "employee" as "employee" | "contractor",
  rate: "",
  hireDate: "",
  paySettings: DEFAULT_PAY as PaySettings,
  timeOverrides: { breakPreset: "", geofenceOptOut: false } as WorkerTimeOverrides,
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
    paySettings: readPaySettings(row.pay_settings),
    timeOverrides: readWorkerOverrides({ timeOverrides: row.time_overrides }),
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
    time_overrides: timeOverridesRow(person.timeOverrides || {}),
    // Only sent once the owner picked something other than the default (older databases have no column).
    ...(person.paySettings && (person.paySettings.type !== "hourly" || person.paySettings.overtime || person.paySettings.travelRate) ? { pay_settings: person.paySettings } : {}),
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

  /** R92: owner-confirmed invite. App email when it's set up, else the owner's own email app (mailto). */
  async function invite(person: Employee) {
    const email = (person.email || "").trim();
    if (!email || !window.confirm(`Send a crew invite to ${email}?`)) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || "";
    const response = token ? await fetch("/api/email/invite", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ employeeId: person.id }) }).catch(() => null) : null;
    if (response?.ok) { setMessage(`Invite sent to ${email}.`); return; }
    const error = response ? String(((await response.json().catch(() => ({}))) as { error?: string }).error || "") : "";
    if (response && response.status !== 503) { setMessage(`Invite not sent: ${error || "try again"}.`); return; }
    const business = (() => { try { return String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").businessName || ""); } catch { return ""; } })();
    const { subject, text } = inviteText(business, person.name, window.location.origin, email.toLowerCase());
    window.location.href = mailtoHref(email, subject, text);
    setMessage("Opened your email app with the invite. Nothing is sent until you send it there.");
  }

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
    const payError = payProblem(form.paySettings, form.rate);
    if (payError) return setMessage(payError);
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
      // Log per-worker timesheet setting changes (travel rate, break rules, distance check, hire date) in the time history.
      const was = { travelRate: readPaySettings(current?.paySettings).travelRate || "", ...timeOverridesRow(current?.timeOverrides || {}) } as Record<string, unknown>;
      const now = { travelRate: nextPerson.paySettings?.travelRate || "", ...timeOverridesRow(nextPerson.timeOverrides || {}) } as Record<string, unknown>;
      const diff = ["travelRate", "breakPreset", "geofenceOptOut"].filter((k) => was[k] !== now[k]);
      if (diff.length || (current?.hireDate || "") !== nextPerson.hireDate) {
        const { logAudit } = await import("@/lib/day-events");
        void logAudit({ action: "worker_rules", employeeId: nextPerson.id, oldValue: { ...Object.fromEntries(diff.map((k) => [k, was[k] ?? ""])), ...((current?.hireDate || "") !== nextPerson.hireDate ? { hireDate: current?.hireDate || "" } : {}) }, newValue: { ...Object.fromEntries(diff.map((k) => [k, now[k] ?? ""])), ...((current?.hireDate || "") !== nextPerson.hireDate ? { hireDate: nextPerson.hireDate } : {}) } });
      }
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
      paySettings: readPaySettings(person.paySettings),
      timeOverrides: timeOverridesRow(person.timeOverrides || {}),
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
      <FormDraft form="employee" id={editingId} value={form} blank={emptyForm} onRestore={setForm} what="team member details" />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-teal-500/20 p-4 [&>input]:w-full [&>select]:w-full">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Person & role</h2>
        <input name="name" aria-label="Name" autoComplete="name" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input name="email" aria-label="Login email" autoComplete="email" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Email they will use to log in" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        <input name="phone" aria-label="Phone" autoComplete="tel" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input name="role" aria-label="Role" autoComplete="off" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
        <select name="kind" aria-label="Worker type" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as "employee" | "contractor" })}>
          <option value="employee">Employee</option>
          <option value="contractor">Contractor</option>
        </select>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 rounded-xl border border-teal-500/20 p-4 min-[360px]:grid-cols-2 [&>*]:min-w-0">
          <h2 className="col-span-full text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Pay & start date</h2>
        <label className="block min-w-0 text-sm font-medium">
          Hourly rate
          <input name="rate" autoComplete="off" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="e.g. 24" data-testid="emp-rate" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
        </label>
        <label className="block min-w-0 text-sm font-medium">
          Hire date
          <input type="date" name="hireDate" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.hireDate} onChange={(event) => setForm({ ...form, hireDate: event.target.value })} />
        </label>
                  <fieldset className="cr-panel col-span-full space-y-3 rounded-xl border border-teal-500/25 p-3 text-sm sm:p-4" data-testid="pay-settings">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">How they&apos;re paid</legend>
            <select aria-label="Pay type" name="payType" data-testid="pay-type" className="min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.type} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, type: event.target.value as PaySettings["type"] } })}>
              <option value="hourly">Clocked hours on jobs (hourly)</option>
              <option value="day">Fixed day (paid regardless of the clock)</option>
              <option value="job">Set amount per job</option>
              <option value="shift">Set shift (4, 8, 10 h or custom)</option>
              <option value="salary">Salary (weekly amount)</option>
              <option value="piece">Piece rate (per unit)</option>
              <option value="commission">Commission (% of the job)</option>
              <option value="hybrid">Hourly + per unit + per job</option>
            </select>
            {(form.paySettings.type === "piece" || form.paySettings.type === "hybrid") && <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-[var(--cr-muted)]">$ per unit<input name="payPieceRate" data-testid="pay-piece-rate" inputMode="decimal" placeholder="e.g. 2.50" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.pieceRate || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, pieceRate: event.target.value } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Unit name<input name="payPieceUnit" data-testid="pay-piece-unit" placeholder="e.g. sq ft, window" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 outline-none" value={form.paySettings.pieceUnit || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, pieceUnit: event.target.value } })} /></label>
            </div>}
            {form.paySettings.type === "hybrid" && <label className="block text-sm font-medium text-[var(--cr-muted)]">Plus per job $ (optional)<input name="payHybridJob" data-testid="pay-hybrid-job" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.jobAmount || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, jobAmount: event.target.value } })} /></label>}
            {form.paySettings.type === "commission" && <label className="block text-sm font-medium text-[var(--cr-muted)]">Commission % of the job price (before tax)<input name="payCommissionPct" data-testid="pay-commission-pct" inputMode="decimal" placeholder="e.g. 10" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.commissionPct || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, commissionPct: event.target.value } })} /></label>}
            {(form.paySettings.type === "piece" || form.paySettings.type === "commission") && <p className="text-xs text-[var(--cr-muted)]" data-testid="pay-minwage-note">Hours still count: the account minimum wage and overtime rules (Timesheet rules) top this up when on.</p>}
            {form.paySettings.type === "day" && <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Hours per day<input name="payDayHours" data-testid="pay-day-hours" inputMode="decimal" placeholder="8" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.dayHours || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, dayHours: event.target.value } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">or Day rate $<input name="payDayRate" data-testid="pay-day-rate" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.dayRate || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, dayRate: event.target.value } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Half day if under (h, optional)<input name="payHalfDay" data-testid="pay-half-day" inputMode="decimal" placeholder="4" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.halfDayHours || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, halfDayHours: event.target.value } })} /></label>
              <p className="col-span-2 text-xs text-[var(--cr-muted)]">Paid once per day, even with two jobs that day. With a half-day rule, a day under that many hours (from the day timesheet) pays half.</p>
            </div>}
            {form.paySettings.type === "shift" && <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Shift length (h)<input name="payShiftHours" data-testid="pay-shift-hours" inputMode="decimal" placeholder="8" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.shiftHours || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, shiftHours: event.target.value } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Short day if under (h)<input name="payShiftMin" data-testid="pay-shift-min" inputMode="decimal" placeholder="half the shift" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.shiftMinHours || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, shiftMinHours: event.target.value } })} /></label>
              <p className="col-span-2 text-xs text-[var(--cr-muted)]">Pays the full shift at the hourly rate when he works at least the short-day hours. A shorter day pays only the hours actually worked, never a full shift.</p>
            </div>}
            {form.paySettings.type === "salary" && <div className="grid gap-2">
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Weekly salary $<input name="paySalary" data-testid="pay-salary" inputMode="decimal" placeholder="" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.salaryWeekly || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, salaryWeekly: event.target.value } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Pay starts on (hire date)<input type="date" name="payStart" data-testid="pay-start" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.payStart || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, payStart: event.target.value } })} /></label>
              <p className="text-xs text-[var(--cr-muted)]">Paid once per week. Each job gets a share of it for job costing only (by hours), so it&apos;s never counted twice.</p>
            </div>}
            {form.paySettings.type !== "job" && form.paySettings.type !== "salary" && <label className="block text-sm font-medium text-[var(--cr-muted)]">Drive-time rate $/hr (blank = same rate)<input name="payTravelRate" data-testid="pay-travel-rate" inputMode="decimal" placeholder="" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.travelRate || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, travelRate: event.target.value } })} /></label>}
            {form.paySettings.type === "job" && <label className="block text-sm font-medium text-[var(--cr-muted)]">Amount per job $<input name="payJobAmount" data-testid="pay-job-amount" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.jobAmount || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, jobAmount: event.target.value } })} /></label>}
            <div className="cr-section grid gap-2 rounded-lg border p-2" data-testid="worker-time-settings">
              <p className="cr-section-label text-xs font-semibold">Timesheet (blank = account rules)</p>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Break rules<select name="payBreakPreset" data-testid="worker-break-preset" className="mt-1.5 block min-h-11 w-full rounded-lg border bg-transparent px-3" value={form.timeOverrides.breakPreset || ""} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, breakPreset: event.target.value as WorkerTimeOverrides["breakPreset"] } })}><option value="">Account rules</option><option value="federal">Federal</option><option value="california">California</option></select></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="payGeofenceOff" data-testid="worker-geofence-off" checked={Boolean(form.timeOverrides.geofenceOptOut)} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, geofenceOptOut: event.target.checked } })} />Skip the job-site distance check for this worker</label>
            </div>
            <div className="cr-section grid gap-2 rounded-lg border p-2" data-testid="worker-lead-settings">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="leadOn" data-testid="worker-lead" checked={Boolean(form.timeOverrides.lead)} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, lead: event.target.checked || undefined } })} />Crew lead (sees the crew&apos;s hours, never prices or pay)</label>
              {form.timeOverrides.lead && <>
                <p className="text-xs font-semibold">Their crew</p>
                <div className="flex flex-wrap gap-2" data-testid="worker-lead-crew">
                  {employees.filter((e) => e.active && e.id !== editingId).map((e) => {
                    const on = (form.timeOverrides.crewIds || []).includes(e.id);
                    return <label key={e.id} className="flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-sm"><input type="checkbox" data-testid={`worker-lead-crew-${e.id}`} checked={on} onChange={() => setForm({ ...form, timeOverrides: { ...form.timeOverrides, crewIds: on ? (form.timeOverrides.crewIds || []).filter((x) => x !== e.id) : [...(form.timeOverrides.crewIds || []), e.id] } })} />{e.name}</label>;
                  })}
                </div>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-testid="worker-lead-see-hours" checked={form.timeOverrides.leadPerms?.seeHours !== false} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, leadPerms: { clockTeam: form.timeOverrides.leadPerms?.clockTeam !== false, seeHours: event.target.checked } } })} />Can see the crew&apos;s hours</label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" data-testid="worker-lead-clock-team" checked={form.timeOverrides.leadPerms?.clockTeam !== false} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, leadPerms: { seeHours: form.timeOverrides.leadPerms?.seeHours !== false, clockTeam: event.target.checked } } })} />Can clock the crew in and out</label>
                <p className="text-xs text-[var(--cr-muted)]">The crew needs an email on Team. Every lead tap is in Change history with the lead&apos;s name.</p>
              </>}
            </div>
            <div className="cr-section grid gap-2 rounded-lg border p-2" data-testid="worker-pto-settings">
              <p className="cr-section-label text-xs font-semibold">Paid time off / sick (blank = account rules)</p>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" id="worker-pto-off" name="ptoOff" data-testid="worker-pto-off" checked={Boolean(form.timeOverrides.ptoOff)} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, ptoOff: event.target.checked || undefined } })} />No PTO for this worker</label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-[var(--cr-muted)]">1 h per … h worked<input id="worker-pto-per" name="ptoPerHours" data-testid="worker-pto-per" inputMode="decimal" placeholder="account" className="mt-1.5 block min-h-11 w-full rounded-lg border bg-transparent px-3 text-right" value={form.timeOverrides.ptoPerHours || ""} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, ptoPerHours: Number(event.target.value) || undefined } })} /></label>
                <label className="block text-sm font-medium text-[var(--cr-muted)]">Carried-in hours<input id="worker-pto-start" name="ptoStartHours" data-testid="worker-pto-start" inputMode="decimal" placeholder="0" className="mt-1.5 block min-h-11 w-full rounded-lg border bg-transparent px-3 text-right" value={form.timeOverrides.ptoStartHours || ""} onChange={(event) => setForm({ ...form, timeOverrides: { ...form.timeOverrides, ptoStartHours: Number(event.target.value) || undefined } })} /></label>
              </div>
            </div>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="payOtOn" data-testid="pay-ot-on" checked={Boolean(form.paySettings.overtime?.on)} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, overtime: { weekly: "40", daily: "", multiplier: "1.5", ...form.paySettings.overtime, on: event.target.checked } } })} />Pay overtime (hourly hours)</label>
            {form.paySettings.overtime?.on && <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Weekly over (h)<input name="payOtWeekly" data-testid="pay-ot-weekly" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.overtime.weekly || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, overtime: { ...form.paySettings.overtime!, weekly: event.target.value } } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Daily over (h, optional)<input name="payOtDaily" data-testid="pay-ot-daily" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.overtime.daily || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, overtime: { ...form.paySettings.overtime!, daily: event.target.value } } })} /></label>
              <label className="block text-sm font-medium text-[var(--cr-muted)]">Multiplier<input name="payOtMultiplier" data-testid="pay-ot-multiplier" inputMode="decimal" className="mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" value={form.paySettings.overtime.multiplier || ""} onChange={(event) => setForm({ ...form, paySettings: { ...form.paySettings, overtime: { ...form.paySettings.overtime!, multiplier: event.target.value } } })} /></label>
            </div>}
          </fieldset>
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
            <p className="text-base font-semibold">{person.name} <span className="font-medium text-teal-600 dark:text-teal-300" data-testid="pay-label">· {payLabel(readPaySettings(person.paySettings), person.rate)}{person.paySettings?.overtime?.on ? ` · OT ${person.paySettings.overtime.multiplier || "1.5"}x` : ""}</span></p>
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
              {person.email && person.active && <button type="button" data-testid={`crew-invite-${person.id}`} onClick={() => invite(person)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400 max-sm:min-h-11">Invite to crew app</button>}
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
      <TimesheetRules />
      <TimesheetExport names={Object.fromEntries(employees.map((person) => [person.id, person.name]))} />
      </div>
      </div>
      <ScheduleReconcile />
    </AppShell>
  );
}