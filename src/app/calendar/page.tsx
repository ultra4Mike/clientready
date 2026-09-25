"use client";

import { useEffect, useMemo, useState } from "react";

type Client = {
  id: string;
  name: string;
  nextVisit?: string;
  notes?: string;
};

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
    items?: LineItem[];
  };
};

type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  detail: string;
  kind: "visit" | "invoice";
  documentId?: string;
};

function monthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.qty) || 0) * (Number(item.rate) || 0);
  }, 0);
  return subtotal + subtotal * ((Number(doc.data?.taxPercent) || 0) / 100);
}

export default function CalendarPage() {
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    const docsRaw = window.localStorage.getItem("clientready-documents");
    if (clientsRaw) setClients(JSON.parse(clientsRaw));
    if (docsRaw) setDocuments(JSON.parse(docsRaw));
  }, []);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];

    clients.forEach((client) => {
      if (!client.nextVisit) return;
      list.push({
        id: `visit-${client.id}`,
        date: client.nextVisit,
        title: client.name,
        detail: client.notes || "Scheduled visit",
        kind: "visit",
      });
    });

    documents.forEach((doc) => {
      if (doc.type !== "invoice" || !doc.data?.dueDate) return;
      const itemNames = (doc.data.items || [])
        .map((item) => item.description || "Item")
        .join(", ");
      list.push({
        id: `invoice-${doc.id}`,
        date: doc.data.dueDate,
        title: `${doc.title} · ${doc.clientName || "Client"}`,
        detail: `${doc.data.status || "draft"} · $${invoiceTotal(doc).toFixed(2)} · ${itemNames}`,
        kind: "invoice",
        documentId: doc.id,
      });
    });

    return list;
  }, [clients, documents]);

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

  function openEvent(event: CalendarEvent) {
    if (event.kind === "invoice" && event.documentId) {
      window.localStorage.setItem("clientready-open-document", event.documentId);
      window.location.href = "/invoice-view";
      return;
    }
    window.location.href = "/clients";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">Calendar</div>
        </div>
      </header>

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
          Green = scheduled visit. Blue = invoice due. Click a day, then click an
          item to open it.
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
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={`truncate rounded px-1 text-xs text-white ${
                        event.kind === "visit" ? "bg-emerald-700" : "bg-sky-700"
                      }`}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">
            {selectedDate ? `Agenda for ${selectedDate}` : "Select a day"}
          </h2>
          {selectedDate && selectedEvents.length === 0 && (
            <p className="mt-2 text-sm text-slate-600">Nothing scheduled.</p>
          )}
          {selectedEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => openEvent(event)}
              className="mt-3 block w-full rounded-xl border border-slate-200 p-3 text-left"
            >
              <p className="font-medium">{event.title}</p>
              <p className="text-sm text-slate-600">
                {event.kind === "visit" ? "Visit" : "Invoice due"} · {event.detail}
              </p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}