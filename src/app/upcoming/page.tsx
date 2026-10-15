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

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">This week</h1>
        <p className="mt-2 text-slate-600">
          Invoices and jobs due in the next 7 days.
        </p>

        <div className="mt-8 space-y-3">
          {upcoming.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              Nothing scheduled this week.
            </p>
          )}

          {upcoming.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => openView(doc.id)}
              className="block w-full rounded-2xl border border-slate-200 bg-white p-5 text-left"
            >
              <p className="font-medium">
                {doc.data?.jobTime ? `${doc.data.jobTime} · ` : ""}
                {doc.title} · {doc.clientName}
              </p>
              <p className="text-sm text-slate-600">
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