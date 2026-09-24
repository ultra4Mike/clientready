"use client";

import { useEffect, useState } from "react";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
};

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-clients");
    if (raw) {
      setClients(JSON.parse(raw));
    }
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="font-semibold">
            ClientReady
          </a>
          <div className="flex gap-4 text-sm text-slate-600">
            <a href="/profile">Profile</a>
            <a href="/clients">Clients</a>
            <a href="/documents">Documents</a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Create a document or open your client book.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a href="/proposal" className="rounded-2xl border border-slate-200 bg-white p-5">
            New proposal
          </a>
          <a href="/invoice" className="rounded-2xl border border-slate-200 bg-white p-5">
            New invoice
          </a>
          <a href="/email" className="rounded-2xl border border-slate-200 bg-white p-5">
            New client email
          </a>
          <a href="/report" className="rounded-2xl border border-slate-200 bg-white p-5">
            New report
          </a>
        </div>

        <div className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Client book</h2>
            <a href="/clients" className="text-sm text-slate-600">
              Manage clients
            </a>
          </div>

          {clients.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              No clients saved yet. Add one on the Clients page.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-slate-600">{client.company}</p>
                  <p className="text-sm text-slate-600">{client.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}