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
    outcome?: string;
    taxPercent?: string;
    discountType?: string;
    discountValue?: string;
    jobTime?: string;
    items?: LineItem[];
  };
};

type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: "invoice";
  documentId: string;
  jobTime?: string;
};

function monthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function agendaLabel(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + amountOf(item.qty) * amountOf(item.rate);
  }, 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}

export default function CalendarPage() {
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [timeById, setTimeById] = useState<Record<string, string>>({});

  useEffect(() => {
    const docsRaw = window.localStorage.getItem("clientready-documents");
    if (docsRaw) setDocuments(uniqueDocs(JSON.parse(docsRaw)));
  }, []);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];
    documents.forEach((doc) => {
      if (doc.type !== "invoice" || !doc.data?.dueDate) return;
      const itemNames = (doc.data.items || [])
        .map((item) => item.description || "Item")
        .join(", ");
      const jobTime = doc.data.jobTime || "";
      list.push({
        id: `invoice-${doc.id}`,
        date: doc.data.dueDate,
        title: `${jobTime ? jobTime + " · " : ""}${doc.title} · ${doc.clientName || "Client"}`,
        detail: `${doc.data.status || "draft"} · $${invoiceTotal(doc).toFixed(2)} · ${itemNames}`,
        kind: "invoice",
        documentId: doc.id,
        jobTime,
      });
    });
    return list;
  }, [documents]);

  const days = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < firstDay; i += 1) cells.push({ date: null, day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      cells.push({ date: ymd(date), day });
    }
    return cells;
  }, [monthDate]);

  const selectedEvents = events.filter((event) => event.date === selectedDate);

  function changeMonth(amount: number) {
    setMonthDate(
      new Date(monthDate.getFullYear(), monthDate.getMonth() + amount, 1)
    );
    setSelectedDate("");
  }

  function openView(id: string) {
    window.localStorage.setItem("clientready-open-document", id);
    window.location.href = "/invoice-view";
  }

  function saveTime(id: string) {
    const jobTime = timeById[id];
    if (!jobTime) return;
    const next = documents.map((doc) => {
      if (doc.id !== id) return doc;
      return {
        ...doc,
        data: {
          ...(doc.data || {}),
          jobTime,
        },
      };
    });
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

  return (
    <AppShell title="Calendar">

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => changeMonth(-1)}>
            Previous
          </button>
          <h1 className="text-2xl font-semibold">{monthLabel(monthDate)}</h1>
          <button type="button" onClick={() => changeMonth(1)}>
            Next
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Click a day, then set the time on that invoice.
        </p>

        <div className="mt-6 grid grid-cols-7 gap-2 text-center text-sm font-medium text-slate-500">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {days.map((cell, index) => {
            const dayEvents = events.filter((event) => event.date === cell.date);
            const selected = cell.date && cell.date === selectedDate;
            return (
              <button
                key={index}
                type="button"
                disabled={!cell.date}
                onClick={() => cell.date && setSelectedDate(cell.date)}
                className={`min-h-24 rounded-xl border p-2 text-left ${
                  selected
                    ? "border-slate-900 bg-white"
                    : "border-slate-200 bg-white"
                } ${!cell.date ? "border-transparent bg-transparent" : ""}`}
              >
                <div className="text-sm font-medium">{cell.day}</div>
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="truncate rounded bg-sky-700 px-1 text-xs text-white"
                    >
                      {item.title}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">
            {selectedDate ? `Agenda for ${agendaLabel(selectedDate)}` : "Select a day"}
          </h2>

          {selectedDate && selectedEvents.length === 0 && (
            <p className="mt-4 text-sm text-slate-600">
              No invoices on this day.
            </p>
          )}

          {selectedEvents.map((event) => (
            <div
              key={event.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
            >
              <div>
                <p className="font-medium">{event.title}</p>
                <p className="text-sm text-slate-600">{event.detail}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="time"
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={timeById[event.documentId] || event.jobTime || ""}
                  onChange={(change) =>
                    setTimeById({
                      ...timeById,
                      [event.documentId]: change.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() => saveTime(event.documentId)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
                >
                  Save time
                </button>
                <button
                  type="button"
                  onClick={() => openView(event.documentId)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  View invoice
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}