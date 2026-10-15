"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { balanceDue, paidTotal, readPayments, type Payment } from "@/lib/payments";
import { SignatureBlock } from "@/components/SignaturePad";
import { readSignature, type Signature } from "@/lib/signature";
import { amountOf, documentTotals, discountLabel } from "@/lib/discount";

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
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [proposalSignature, setProposalSignature] = useState<Signature | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [status, setStatus] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [logo, setLogo] = useState("");
  const [jobTime, setJobTime] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [message, setMessage] = useState("");

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
      discountType?: string;
      discountValue?: string;
      payments?: unknown;
      signature?: unknown;
      proposalSignature?: unknown;
      paymentAmount?: string;
      paymentMethod?: string;
      paymentDate?: string;
      paymentRef?: string;
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
    setDiscountType(data.discountType || "percent");
    setDiscountValue(data.discountValue || "");
    setPayments(readPayments(data));
    setSignature(readSignature(data.signature));
    setProposalSignature(readSignature(data.proposalSignature));
    setItems(data.items || []);
    setStatus(data.status || "draft");
    setJobTime(data.jobTime || "");
  }, []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      return sum + amountOf(item.qty) * amountOf(item.rate);
    }, 0);
    const base = documentTotals(subtotal, taxPercent, discountType, discountValue);
    const paid = paidTotal(payments);
    return { ...base, paid, balance: balanceDue(base.total, paid, status) };
  }, [items, taxPercent, discountType, discountValue, payments, status]);

  function editInvoice() {
    if (!docId) return;
    window.localStorage.setItem("clientready-open-document", docId);
    window.location.href = "/invoice";
  }

  async function copyPayLink() {
    if (!paymentLink.trim()) {
      window.location.href = "/profile";
      return;
    }
    try {
      await navigator.clipboard.writeText(paymentLink);
      setMessage("Pay link copied");
    } catch {
      setMessage(paymentLink);
    }
    setTimeout(() => setMessage(""), 2000);
  }

  return (
    <AppShell title="Invoice">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <a href="/documents" className="text-sm text-[var(--cr-muted)]">
          Back to documents
        </a>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Print / Save PDF
          </button>
          {status !== "paid" && (
            <button
              type="button"
              onClick={copyPayLink}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              {paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}
            </button>
          )}
          <button
            type="button"
            onClick={editInvoice}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          >
            Edit invoice
          </button>
        </div>
      </div>
      {message && <p className="mb-3 text-sm text-[var(--cr-muted)]">{message}</p>}

      <section className="mx-auto max-w-3xl">
        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
          {logo && <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />}
          <p className="text-sm uppercase tracking-wide text-slate-500">Invoice</p>
          <h1 className="mt-1 text-2xl font-semibold">{invoiceNumber || "Invoice"}</h1>
          <p className="mt-1 text-sm text-slate-600">{status}</p>
          <p className="mt-4 text-sm text-slate-600">{businessName}</p>
          <p className="text-sm text-slate-600">Date: {invoiceDate || "-"}</p>
          <p className="text-sm text-slate-600">Due: {dueDate || "-"}</p>
          {jobTime && <p className="text-sm text-slate-600">Scheduled time: {jobTime}</p>}

          <div className="mt-8">
            <p className="text-sm text-slate-500">Bill to</p>
            <p className="font-medium">{clientName || "Client"}</p>
            {clientCompany && <p className="text-sm text-slate-600">{clientCompany}</p>}
            {clientEmail && <p className="text-sm text-slate-600">{clientEmail}</p>}
            {clientPhone && <p className="text-sm text-slate-600">{clientPhone}</p>}
            {clientAddress && <p className="text-sm text-slate-600">{clientAddress}</p>}
          </div>

          <div className="mt-8 border-t border-slate-200 pt-4">
            {items.map((item, index) => {
              const amount = amountOf(item.qty) * amountOf(item.rate);
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
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <span>{discountLabel(discountType, discountValue)}</span>
                <span>-${totals.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
            {payments.filter((payment) => amountOf(payment.amount) > 0).map((payment) => (
              <div key={payment.id} className="flex justify-between text-slate-600">
                <span>Paid{payment.date ? ` ${payment.date}` : ""}{payment.method ? ` · ${payment.method}` : ""}{payment.ref ? ` · ${payment.ref}` : ""}</span>
                <span>-${amountOf(payment.amount).toFixed(2)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-xl font-bold">
              <span>Still owed</span>
              <span>${totals.balance.toFixed(2)}</span>
            </div>
          </div>

          {notes && <p className="mt-8 text-sm text-slate-600">{notes}</p>}
          {paymentLink && (
            <p className="mt-4 text-sm text-slate-600">Pay here: {paymentLink}</p>
          )}
          <SignatureBlock signature={proposalSignature} label="Proposal accepted" />
          <SignatureBlock signature={signature} />
        </div>
      </section>
    </AppShell>
  );
}