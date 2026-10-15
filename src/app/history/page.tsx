"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    outcome?: string;
    clientEmail?: string;
  };
};

export default function HistoryPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [selectedName, setSelectedName] = useState("");

  useEffect(() => {
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    const docsRaw = window.localStorage.getItem("clientready-documents");
    if (clientsRaw) setClients(JSON.parse(clientsRaw));
    if (docsRaw) setDocuments(JSON.parse(docsRaw));
  }, []);

  const selected = clients.find((client) => client.name === selectedName);

  const history = useMemo(() => {
    if (!selected) return [];
    return documents.filter((doc) => {
      const sameName =
        doc.clientName.trim().toLowerCase() === selected.name.trim().toLowerCase();
      const sameEmail =
        selected.email &&
        String(doc.data?.clientEmail || "").toLowerCase() ===
          selected.email.toLowerCase();
      return sameName || sameEmail;
    });
  }, [documents, selected]);

  function openDocument(doc: SavedDocument) {
    window.localStorage.setItem("clientready-open-document", doc.id);
    if (doc.type === "invoice" || doc.type === "proposal") window.location.href = `/invoice?id=${encodeURIComponent(doc.id)}`;
    else if (doc.type === "email") window.location.href = "/email";
    else window.location.href = "/report";
  }

  return (
    <AppShell title="History">

      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold tracking-tight">Client history</h1>
        <p className="mt-2 text-slate-600">
          Pick a client to see every document attached to them.
        </p>

        <select
          className="mt-6 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          value={selectedName}
          onChange={(event) => setSelectedName(event.target.value)}
        >
          <option value="">Choose a client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.name}>
              {client.name}
              {client.company ? ` - ${client.company}` : ""}
            </option>
          ))}
        </select>

        {selected && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold">{selected.name}</h2>
            <p className="text-sm text-slate-600">{selected.company}</p>
            <p className="text-sm text-slate-600">{selected.email}</p>

            <div className="mt-6 space-y-3">
              {history.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
                  No documents for this client yet.
                </p>
              )}
              {history.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => openDocument(doc)}
                  className="block w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
                >
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-sm text-slate-600">
                    {doc.type} · {doc.createdAt}
                    {doc.data?.status ? ` · ${doc.data.status}` : ""}
                    {doc.data?.outcome ? ` · ${doc.data.outcome}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}