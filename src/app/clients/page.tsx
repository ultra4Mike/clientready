"use client";

import { FormEvent, useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
};

const emptyClient = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState(emptyClient);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-clients");
    if (raw) {
      setClients(JSON.parse(raw));
    }
  }, []);

  function saveClients(next: Client[]) {
    setClients(next);
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    const next = [
      ...clients,
      {
        id: Date.now().toString(),
        ...form,
      },
    ];
    saveClients(next);
    setForm(emptyClient);
  }

  function removeClient(id: string) {
    saveClients(clients.filter((client) => client.id !== id));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">Clients</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h1 className="text-xl font-semibold">Add a client</h1>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Company"
            value={form.company}
            onChange={(event) =>
              setForm({ ...form, company: event.target.value })
            }
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Address"
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          >
            Save client
          </button>
        </form>

        <div className="space-y-3">
          {clients.length === 0 && (
            <p className="text-slate-600">No saved clients yet.</p>
          )}
          {clients.map((client) => (
            <div
              key={client.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="font-medium">{client.name}</p>
              <p className="text-sm text-slate-600">{client.company}</p>
              <p className="text-sm text-slate-600">{client.email}</p>
              <button
                type="button"
                onClick={() => removeClient(client.id)}
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