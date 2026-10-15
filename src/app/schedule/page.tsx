"use client";

import { FormEvent, useEffect, useState } from "react";

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

  useEffect(() => {
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    const apptRaw = window.localStorage.getItem("clientready-appointments");
    if (clientsRaw) setClients(JSON.parse(clientsRaw));
    if (apptRaw) setAppointments(JSON.parse(apptRaw));
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <a href="/calendar" className="text-sm text-slate-600">
            Calendar
          </a>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h1 className="text-xl font-semibold">Schedule a job</h1>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
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
          <label className="text-sm text-slate-600">
            Date
            <input
              type="date"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label className="text-sm text-slate-600">
            Start time
            <input
              type="time"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            />
          </label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Job details"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
          >
            Save appointment
          </button>
        </form>

        <div className="space-y-3">
          {appointments.length === 0 && (
            <p className="text-slate-600">No appointments yet.</p>
          )}
          {appointments
            .slice()
            .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
            .map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <p className="font-medium">{item.clientName}</p>
                <p className="text-sm text-slate-600">
                  {item.date} at {item.time}
                </p>
                {item.notes && (
                  <p className="mt-1 text-sm text-slate-600">{item.notes}</p>
                )}
                <button
                  type="button"
                  onClick={() => removeAppointment(item.id)}
                  className="mt-3 text-sm text-slate-500"
                >
                  Remove
                </button>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}