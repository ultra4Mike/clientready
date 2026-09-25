"use client";

import { useEffect, useMemo, useState } from "react";

type LineItem = {
  description: string;
  qty: string;
  rate: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  data?: Record<string, unknown>;
};

export default function InvoiceViewPage() {
  const [docId, setDocId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [taxPercent, setTaxPercent] = useState("0");
  const [items, setItems] = useState<LineItem[]>([]);
  const [status, setStatus] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [logo, setLogo] = useState("");
  const [jobTime, setJobTime] = useState("");
  const [paymentLink, setPaymentLink] = useState("");

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "");
      setLogo(profile.logo || "");
      setPaymentLink(profile.paymentLink || "");
    }

    const openId = window.localStorage.getItem("clientready-open-document");
    const docsRaw = window.localStorage.getItem("clientready-documents");
    if (!openId || !docsRaw) return;
    const docs = JSON.parse(docsRaw) as SavedDocument[];
    const doc = docs.find((item) => item.id === openId && item.type === "invoice");
    if (!doc) return;
    const data = (doc.data || {}) as {
      invoiceNumber?: string;
      clientName?: string;
      clientCompany?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientAddress?: string;
      invoiceDate?: string;
      dueDate?: string;
      notes?: string;
      taxPercent?: string;
      items?: LineItem[];
      status?: string;
      jobTime?: string;
    };
    setDocId(doc.id);
    setInvoiceNumber(data.invoiceNumber || doc.title);
    setClientName(data.clientName || doc.clientName);
    setClientCompany(data.clientCompany || "");
    setClientEmail(data.clientEmail || "");
    setClientPhone(data.clientPhone || "");
    setClientAddress(data.clientAddress || "");
    setInvoiceDate(data.invoiceDate || "");
    setDueDate(data.dueDate || "");
    setNotes(data.notes || "");
    setTaxPercent(data.taxPercent || "0");
    setItems(data.items || []);
    setStatus(data.status || "draft");
    setJobTime(data.jobTime || "");
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      return sum + (Number(item.qty) || 0) * (Number(item.rate) || 0);
    }, 0);
    const tax = subtotal * ((Number(taxPercent) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxPercent]);

  function editInvoice() {
    if (!docId) return;
    window.localStorage.setItem("clientready-open-document", docId);
    window.location.href = "/invoice";
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/calendar" className="text-sm text-slate-600">
            Back to calendar
          </a>
          <button
            type="button"
            onClick={editInvoice}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          >
            Edit invoice
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-8">
        <div
          id="preview"
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
        >
          {logo && (
            <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />
          )}
          <p className="text-sm uppercase tracking-wide text-slate-500">Invoice</p>
          <h1 className="mt-1 text-2xl font-semibold">
            {invoiceNumber || "Invoice"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{status}</p>
          <p className="mt-4 text-sm text-slate-600">{businessName}</p>
          <p className="text-sm text-slate-600">Date: {invoiceDate || "-"}</p>
          <p className="text-sm text-slate-600">Due: {dueDate || "-"}</p>
          {jobTime && (
            <p className="text-sm text-slate-600">Scheduled time: {jobTime}</p>
          )}

          <div className="mt-8">
            <p className="text-sm text-slate-500">Bill to</p>
            <p className="font-medium">{clientName || "Client"}</p>
            <p className="text-sm text-slate-600">{clientCompany}</p>
            <p className="text-sm text-slate-600">{clientEmail}</p>
            <p className="text-sm text-slate-600">{clientPhone}</p>
            <p className="text-sm text-slate-600">{clientAddress}</p>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-4">
            {items.map((item, index) => {
              const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
              return (
                <div key={index} className="flex justify-between py-2 text-sm">
                  <span>
                    {item.description || "Item"} · {item.qty} x ${item.rate}
                  </span>
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
          {paymentLink && (
            <p className="mt-4 text-sm text-slate-600">
              Pay here: {paymentLink}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}