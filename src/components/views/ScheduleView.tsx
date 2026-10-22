"use client";

import { FormEvent, useEffect, useState } from "react";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { uniqueDocs } from "@/lib/change-orders";
import { hiddenFromCalendar } from "@/lib/doc-status";
import { localYmd, niceYmd, scheduledJobs, timeLabel, type ScheduledJob } from "@/lib/scheduled-jobs";
import { doneState, statusLabel } from "@/lib/schedule";
import PageHeader from "@/components/PageHeader";
import MobileNav from "@/components/MobileNav";

type Client = {
  id: string;
  name: string;
};

type Appointment = {
  id: string;
  clientName: string;
  date: string;
  time: string;
  notes: string;
};

const emptyForm = {
  clientName: "",
  date: "",
  time: "",
  notes: "",
};

export default function SchedulePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    const apptRaw = window.localStorage.getItem("clientready-appointments");
    Promise.resolve().then(() => {
      if (clientsRaw) setClients(JSON.parse(clientsRaw));
      if (apptRaw) setAppointments(JSON.parse(apptRaw));
    });
    // Jobs scheduled on invoices/proposals: the same source as the calendar, from today on.
    const readJobs = () => {
      const raw = window.localStorage.getItem("clientready-documents");
      const today = localYmd();
      const all = raw ? uniqueDocs(JSON.parse(raw) as ScheduledJob["doc"][]) : [];
      setJobs(scheduledJobs(all).filter(({ doc, schedule }) => !hiddenFromCalendar(doc, all) && schedule.date >= today));
    };
    Promise.resolve().then(readJobs);
    loadAccountIntoCache().catch(() => false).then(() => { readJobs(); setLoaded(true); });
  }, []);

  function saveAppointments(next: Appointment[]) {
    setAppointments(next);
    window.localStorage.setItem("clientready-appointments", JSON.stringify(next));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.clientName || !form.date || !form.time) return;
    saveAppointments([
      ...appointments,
      {
        id: Date.now().toString(),
        ...form,
      },
    ]);
    setForm(emptyForm);
  }

  function removeAppointment(id: string) {
    const ok = window.confirm("Are you sure you want to delete this appointment?");
    if (!ok) return;
    saveAppointments(appointments.filter((item) => item.id !== id));
  }

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] pb-[calc(10rem+env(safe-area-inset-bottom))] text-[var(--cr-text)] min-[900px]:pb-0 print:pb-0">
      <header className="app-topbar sticky top-0 z-20 border-b border-teal-500/20 bg-[var(--cr-panel)] print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <a href="/dashboard" className="flex items-center gap-2 text-sm font-medium transition hover:text-teal-500"><span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-slate-950!">C</span>
            Back to dashboard
          </a>
          <a href="/calendar" className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium transition hover:border-teal-400">
            Calendar
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8"><PageHeader title="Schedule" subtitle="Book jobs for your clients and see what's on the books." /></div>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-6 sm:px-6 sm:pb-8 lg:grid-cols-2 lg:gap-8">
        <form
          onSubmit={handleSubmit}
          className="h-fit space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6 lg:sticky lg:top-20"
        >
          <h1 className="text-xl font-bold tracking-tight">Schedule a job</h1>
          <select
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            value={form.clientName}
            onChange={(event) =>
              setForm({ ...form, clientName: event.target.value })
            }
          >
            <option value="">Choose a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.name}>
                {client.name}
              </option>
            ))}
          </select>
          <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[var(--cr-muted)]">
            Date
            <input
              type="date"
              className="mt-1.5 w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-[var(--cr-muted)]">
            Start time
            <input
              type="time"
              className="mt-1.5 w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            />
          </label>
          </div>
          <textarea
            className="min-h-24 w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Job details"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50 sm:w-auto"
          >
            Save appointment
          </button>
        </form>

        <div className="space-y-3">
          {jobs.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Scheduled jobs</h2>}
          {jobs.map(({ doc, schedule }) => (
            <a key={`job-${doc.id}`} href={`/invoice?id=${encodeURIComponent(doc.id)}`} data-testid="schedule-job" className="block rounded-2xl border border-l-4 border-teal-500/20 border-l-teal-500 bg-[var(--cr-card)] p-5 shadow-sm transition hover:border-teal-400">
              <p className="text-base font-semibold">{doc.clientName || doc.title}</p>
              <p className="mt-0.5 text-sm font-semibold text-teal-600 dark:text-teal-300">{niceYmd(schedule.date)}{schedule.startTime ? ` at ${timeLabel(schedule.startTime)}` : ""}</p>
              <p className="mt-1 text-sm text-[var(--cr-muted)]">{doc.title} · <span data-done={doneState(schedule) || undefined}>{statusLabel(schedule)}</span></p>
            </a>
          ))}
          {jobs.length > 0 && appointments.length > 0 && <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Other appointments</h2>}
          {loaded && jobs.length === 0 && appointments.length === 0 && (
            <p className="rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] p-8 text-center text-sm text-[var(--cr-muted)]">No appointments yet.</p>
          )}
          {appointments
            .slice()
            .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
            .map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-l-4 border-teal-500/20 border-l-sky-400 bg-[var(--cr-card)] p-5 shadow-sm"
              >
                <p className="text-base font-semibold">{item.clientName}</p>
                <p className="mt-0.5 text-sm font-semibold text-teal-600 dark:text-teal-300">
                  {item.date} at {item.time}
                </p>
                {item.notes && (
                  <p className="mt-1 text-sm text-[var(--cr-muted)]">{item.notes}</p>
                )}
                <button
                  type="button"
                  onClick={() => removeAppointment(item.id)}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--cr-muted)] transition hover:bg-red-500/10 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      </section>
      <MobileNav />
    </main>
  );
}