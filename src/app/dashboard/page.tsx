"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
};

type LineItem = {
  description?: string;
  qty?: string;
  rate?: string;
};

type SavedDocument = {
  id: string;
  type: "invoice" | "proposal";
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    taxPercent?: string;
    items?: LineItem[];
  };
};

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.qty) || 0) * (Number(item.rate) || 0);
  }, 0);
  return subtotal + subtotal * ((Number(doc.data?.taxPercent) || 0) / 100);
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);

  useEffect(() => {
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    const docsRaw = window.localStorage.getItem("clientready-documents");
    if (clientsRaw) setClients(JSON.parse(clientsRaw));
    if (docsRaw) setDocuments(JSON.parse(docsRaw));
  }, []);

  const stats = useMemo(() => {
    const invoices = documents.filter((doc) => doc.type === "invoice");
    const invoiced = invoices.reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const paid = invoices
      .filter((doc) => doc.data?.status === "paid")
      .reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    return { invoiceCount: invoices.length, invoiced, paid };
  }, [documents]);

  return (
    <AppShell title="Dashboard">
      <p className="text-[var(--cr-muted)]">
        Create a document or review your client book.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Invoices created</p>
          <p className="mt-2 text-2xl font-semibold">{stats.invoiceCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Amount invoiced</p>
          <p className="mt-2 text-2xl font-semibold">
            ${stats.invoiced.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Amount marked paid</p>
          <p className="mt-2 text-2xl font-semibold">${stats.paid.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a href="/proposal" className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          New proposal
        </a>
        <a href="/invoice" className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          New invoice
        </a>
        <a href="/email" className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          New client email
        </a>
        <a href="/report" className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          New report
        </a>
      </div>

      <div className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Client book</h2>
        {clients.length === 0 ? (
          <p className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 text-[var(--cr-muted)]">
            No clients saved yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {clients.map((client) => (
              <div
                key={client.id}
                className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5"
              >
                <p className="font-medium">{client.name}</p>
                <p className="text-sm text-[var(--cr-muted)]">{client.company}</p>
                <p className="text-sm text-[var(--cr-muted)]">{client.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}