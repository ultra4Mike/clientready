"use client";

import { useEffect, useMemo, useState } from "react";

type LineItem = {
  description: string;
  qty: string;
  rate: string;
};

const emptyItem: LineItem = { description: "", qty: "1", rate: "" };

export default function NewInvoicePage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-1001");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("Payment is due within 14 days.");
  const [taxPercent, setTaxPercent] = useState("0");
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [businessName, setBusinessName] = useState("Your business");
  const [ownerName, setOwnerName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (!raw) return;
    const profile = JSON.parse(raw);
    setBusinessName(profile.businessName || "Your business");
    setOwnerName(profile.ownerName || "");
    setBusinessEmail(profile.email || "");
    setBusinessPhone(profile.phone || "");
  }, []);

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      return sum + qty * rate;
    }, 0);
    const tax = subtotal * ((Number(taxPercent) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxPercent]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">New invoice</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Invoice details</h1>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client email"
            value={clientEmail}
            onChange={(event) => setClientEmail(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Invoice number"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Invoice date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              Due date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Line items</h2>
              <button
                type="button"
                className="text-sm text-slate-700"
                onClick={() => setItems((current) => [...current, { ...emptyItem }])}
              >
                Add item
              </button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-3">
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Description"
                  value={item.description}
                  onChange={(event) =>
                    updateItem(index, "description", event.target.value)
                  }
                />
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(event) => updateItem(index, "qty", event.target.value)}
                />
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Rate"
                  value={item.rate}
                  onChange={(event) => updateItem(index, "rate", event.target.value)}
                />
              </div>
            ))}
          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Tax percent"
            value={taxPercent}
            onChange={(event) => setTaxPercent(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Notes / payment instructions"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Print / Save PDF
        </button>
        
        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Invoice</p>
              <h2 className="mt-1 text-2xl font-semibold">
                {invoiceNumber || "INV-0000"}
              </h2>
            </div>

          <div className="mt-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">
               {businessName}</p>
            <p>{ownerName}</p>
            <p>{businessEmail}</p>
            <p>{businessPhone}</p>
          </div>

            <div className="text-right text-sm text-slate-600">
              <div>Date: {invoiceDate || "—"}</div>
              <div>Due: {dueDate || "—"}</div>
            </div>
          </div>

          <div className="mt-8">
            <p className="text-sm text-slate-500">Bill to</p>
            <p className="font-medium">{clientName || "Client name"}</p>
            <p className="text-sm text-slate-600">{clientEmail || "client@email.com"}</p>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-4">
            {items.map((item, index) => {
              const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
              return (
                <div key={index} className="flex justify-between py-2 text-sm">
                  <span>{item.description || "Item"}</span>
                  <span>${amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 space-y-1 border-t border-slate-200 pt-4 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>${totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
          </div>

          <p className="mt-8 text-sm text-slate-600">{notes}</p>
        </div>
      </section>
    </main>
  );
}