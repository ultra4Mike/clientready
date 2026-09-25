"use client";

import { useEffect, useMemo, useState } from "react";

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
  return new Date(due) < new Date();
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

  function markPaid(id: string) {
    const next = documents.map((doc) => {
      if (doc.id !== id) return doc;
      return {
        ...doc,
        data: {
          ...(doc.data || {}),
          status: "paid",
        },
      };
    });
    saveDocs(next);
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">Collect</div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Money to collect</h1>
        <p className="mt-2 text-slate-600">
          Unpaid invoices and overdue amounts.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Unpaid invoices</p>
            <p className="mt-2 text-2xl font-semibold">{totals.unpaidCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Open amount</p>
            <p className="mt-2 text-2xl font-semibold">
              ${totals.openAmount.toFixed(2)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Overdue</p>
            <p className="mt-2 text-2xl font-semibold">
              ${totals.overdueAmount.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {unpaid.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              Nothing to collect. Unpaid invoices will show here.
            </p>
          )}

          {unpaid.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-slate-600">
                  {doc.clientName || "No client"} · {doc.data?.status || "draft"}
                  {doc.data?.dueDate ? ` · due ${doc.data.dueDate}` : ""}
                  {isOverdue(doc) ? " · overdue" : ""}
                </p>
                <p className="mt-1 font-semibold">
                  ${invoiceTotal(doc).toFixed(2)}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => openInvoice(doc.id)}
                  className="text-sm font-medium"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => markPaid(doc.id)}
                  className="text-sm font-medium"
                >
                  Mark paid
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}