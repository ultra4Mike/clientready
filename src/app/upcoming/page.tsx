"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { amountOf, documentTotals } from "@/lib/discount";
import { uniqueDocs } from "@/lib/change-orders";

type LineItem = {
  description?: string;
  qty?: string;
  rate?: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  data?: {
    dueDate?: string;
    status?: string;
    jobTime?: string;
    taxPercent?: string;
    discountType?: string;
    discountValue?: string;
    items?: LineItem[];
  };
};

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + amountOf(item.qty) * amountOf(item.rate);
  }, 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}

function niceDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

export default function UpcomingPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(uniqueDocs(JSON.parse(raw)));
  }, []);

  const upcoming = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return documents
      .filter((doc) => doc.type === "invoice" && doc.data?.dueDate)
      .filter((doc) => {
        const date = new Date(doc.data?.dueDate + "T00:00:00");
        return date >= start && date <= end;
      })
      .sort((a, b) => {
        const aKey = `${a.data?.dueDate}-${a.data?.jobTime || ""}`;
        const bKey = `${b.data?.dueDate}-${b.data?.jobTime || ""}`;
        return aKey.localeCompare(bKey);
      });
  }, [documents]);

  function openView(id: string) {
    window.localStorage.setItem("clientready-open-document", id);
    window.location.href = "/invoice-view";
  }

  return (
    <AppShell title="Upcoming">

      <section className="max-w-4xl py-2 sm:py-4">
        <h1 className="text-2xl font-bold tracking-tight">This week</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">
          Invoices and jobs due in the next 7 days.
        </p>

        <div className="mt-8 space-y-3">
          {upcoming.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-xl">📅</span><p className="text-base font-semibold">Nothing scheduled this week.</p><p className="max-w-sm text-sm text-[var(--cr-muted)]">Invoices due and jobs in the next 7 days will appear here.</p><a href="/calendar" className="mt-2 rounded-lg border border-teal-500/30 px-4 py-2 text-sm font-medium">Open calendar</a></div>
          )}

          {upcoming.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => openView(doc.id)}
              className="block w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
            >
              <p className="text-base font-semibold">
                {doc.data?.jobTime ? `${doc.data.jobTime} · ` : ""}
                {doc.title} · {doc.clientName}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {niceDate(doc.data?.dueDate || "")} · {doc.data?.status || "draft"} · $
                {invoiceTotal(doc).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}