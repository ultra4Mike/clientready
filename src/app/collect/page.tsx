"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { saveCloudDocument } from "@/lib/cloud-docs";

type LineItem = {
  qty?: string;
  rate?: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    dueDate?: string;
    taxPercent?: string;
    items?: LineItem[];
    [key: string]: unknown;
  };
};

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.qty) || 0) * (Number(item.rate) || 0);
  }, 0);
  return subtotal + subtotal * ((Number(doc.data?.taxPercent) || 0) / 100);
}

function isOverdue(doc: SavedDocument) {
  const due = doc.data?.dueDate;
  const status = doc.data?.status || "draft";
  if (!due || status === "paid") return false;
  if (status === "overdue") return true;
  return new Date(`${due}T23:59:59`) < new Date();
}

export default function CollectPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(JSON.parse(raw));
  }, []);

  function saveDocs(next: SavedDocument[]) {
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

async function setStatus(id: string, status: string) {
    const next = documents.map((doc) => {
      if (doc.id !== id) return doc;
      return {
        ...doc,
        data: {
          ...(doc.data || {}),
          status,
        },
      };
    });
    saveDocs(next);
    const updated = next.find((doc) => doc.id === id);
    if (!updated) return;
    await saveCloudDocument({
      id: updated.id,
      type: updated.type,
      title: updated.title,
      clientName: updated.clientName,
      createdAt: updated.createdAt,
      data: updated.data || {},
    });
  }

  function openInvoice(id: string) {
    window.localStorage.setItem("clientready-open-document", id);
    window.location.href = "/invoice";
  }

  const invoices = documents.filter((doc) => doc.type === "invoice");
  const unpaid = invoices.filter((doc) => (doc.data?.status || "draft") !== "paid");

  const totals = useMemo(() => {
    const openAmount = unpaid.reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const overdueAmount = unpaid
      .filter(isOverdue)
      .reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    return { openAmount, overdueAmount, unpaidCount: unpaid.length };
  }, [unpaid]);

  return (
    <AppShell title="Collect">
      <p className="text-[var(--cr-muted)]">Unpaid invoices and overdue amounts.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Unpaid invoices</p>
          <p className="mt-2 text-2xl font-semibold">{totals.unpaidCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Open amount</p>
          <p className="mt-2 text-2xl font-semibold">${totals.openAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Overdue</p>
          <p className="mt-2 text-2xl font-semibold">${totals.overdueAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {unpaid.length === 0 && (
          <p className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 text-[var(--cr-muted)]">
            Nothing to collect. Unpaid invoices will show here.
          </p>
        )}

        {unpaid.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">{doc.title}</p>
              <p className="text-sm text-[var(--cr-muted)]">
                {doc.clientName || "No client"} · {doc.data?.status || "draft"}
                {doc.data?.dueDate ? ` · due ${doc.data.dueDate}` : ""}
                {isOverdue(doc) ? " · overdue" : ""}
              </p>
              <p className="mt-1 font-semibold">${invoiceTotal(doc).toFixed(2)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => openInvoice(doc.id)} className="text-sm font-medium">
                Open
              </button>
              <button
                type="button"
                onClick={() => setStatus(doc.id, "sent")}
                className="text-sm font-medium"
              >
                Mark sent
              </button>
              <button
                type="button"
                onClick={() => setStatus(doc.id, "paid")}
                className="text-sm font-medium"
              >
                Mark paid
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}