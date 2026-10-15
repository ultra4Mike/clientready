"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { balanceDue, paidTotal, readPayments, type Payment } from "@/lib/payments";
import { JobPhotoStrip } from "@/components/JobPhotos";
import { readPhotos, type JobPhoto } from "@/lib/photos";
import LineSplit from "@/components/LineSplit";
import ChangeOrderNotes from "@/components/ChangeOrderNotes";
import { changeOrdersFor, mergeChangeOrderNotes, readChangeOrderNotes, readChangeOrderOf, type ChangeOrderNote, type ChangeOrderOf } from "@/lib/change-orders";
import PayQr from "@/components/PayQr";
import { payUrlFor } from "@/lib/pay-link";
import { SignatureBlock } from "@/components/SignaturePad";
import { readSignature, type Signature } from "@/lib/signature";
import { ApprovalBadge } from "@/components/Approval";
import { readApproval, refreshApproval, type Approval } from "@/lib/approval";
import { amountOf, documentTotals, discountLabel } from "@/lib/discount";

type LineItem = {
  description: string;
  qty: string;
  rate: string;
  category?: string;
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
  const [docPayLink, setDocPayLink] = useState("");
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [changeOrderOf, setChangeOrderOf] = useState<ChangeOrderOf | null>(null);
  const [changeOrderNotes, setChangeOrderNotes] = useState<ChangeOrderNote[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [proposalSignature, setProposalSignature] = useState<Signature | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [status, setStatus] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [logo, setLogo] = useState("");
  const [jobTime, setJobTime] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [message, setMessage] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "");
      setLogo(profile.logo || "");
      setPaymentLink(profile.paymentLink || "");
    }

    const openId = new URLSearchParams(window.location.search).get("id") || window.localStorage.getItem("clientready-open-document");
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
      payLink?: string;
      photos?: unknown;
      showPhotos?: unknown;
      changeOrderOf?: unknown;
      changeOrderNotes?: unknown;
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
    setDocPayLink(data.payLink || "");
    setPhotos(data.showPhotos === true ? readPhotos(data.photos) : []);
    setChangeOrderOf(readChangeOrderOf(data.changeOrderOf));
    // Stored notes, plus any change orders found by search (e.g. made before notes existed).
    const found = changeOrdersFor(docs, doc.id).map((order) => ({ id: order.id, number: order.number, createdAt: "" }));
    setChangeOrderNotes(mergeChangeOrderNotes(readChangeOrderNotes(data.changeOrderNotes), found));
    setProposalSignature(readSignature(data.proposalSignature));
    setItems(data.items || []);
    setStatus(data.status || "draft");
    setJobTime(data.jobTime || "");
    setApproval(readApproval(doc.data?.approval));
    refreshApproval(doc.id).then((latest) => { if (latest !== undefined) setApproval(latest); });
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
    window.location.href = `/invoice?id=${encodeURIComponent(docId)}`;
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
      <div className="print-hide mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <a href="/documents" className="text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600 dark:hover:text-teal-300">
          Back to documents
        </a>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-teal-500/30 px-4 py-2 text-sm font-medium text-teal-700 transition dark:text-teal-200 hover:border-teal-400/60 hover:bg-teal-500/10"
          >
            Print / Save PDF
          </button>
          {status !== "paid" && (
            <button
              type="button"
              onClick={copyPayLink}
              className="rounded-xl border border-teal-500/30 px-4 py-2 text-sm font-medium text-teal-700 transition dark:text-teal-200 hover:border-teal-400/60 hover:bg-teal-500/10"
            >
              {paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}
            </button>
          )}
          <button
            type="button"
            onClick={editInvoice}
            className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400"
          >
            Edit invoice
          </button>
        </div>
      </div>
      {message && <p className="print-hide mx-auto mb-4 max-w-3xl rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2 text-sm text-[var(--cr-muted)]">{message}</p>}

      <section className="print-reset mx-auto max-w-3xl">
        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-lg sm:p-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-sm text-slate-600">
              {logo && <img src={logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
              <p className="font-semibold">{businessName}</p>
              {jobTime && <p>Scheduled time: {jobTime}</p>}
            </div>
            <div className="shrink-0 text-right">
              {approval && <div className="mb-1"><ApprovalBadge approval={approval} /></div>}
              {changeOrderOf && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
              <p className="text-xs uppercase tracking-wide text-slate-500">Invoice · {status}</p>
              <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight">{invoiceNumber || "Invoice"}</h1>
              <p className="text-sm text-slate-600">Date: {invoiceDate || "-"} · Due: {dueDate || "-"}</p>
              {changeOrderOf && (
                <p className="text-sm text-slate-600" data-testid="change-order-link">
                  Change order to <a className="underline" href={`/invoice?id=${encodeURIComponent(changeOrderOf.id)}`}>{changeOrderOf.number}</a>
                </p>
              )}
              <ChangeOrderNotes notes={changeOrderNotes} className="text-xs text-slate-600" />
            </div>
          </div>

          <div className="mt-8 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Bill to</p>
            <p className="font-medium">
              {clientName || "Client"}
              {clientCompany && <span className="font-normal text-slate-600"> · {clientCompany}</span>}
            </p>
            {(clientEmail || clientPhone) && <p className="text-slate-600">{[clientEmail, clientPhone].filter(Boolean).join(" · ")}</p>}
            {clientAddress && <p className="text-slate-600">{clientAddress}</p>}
          </div>

          <div className="mt-8 border-t border-slate-200 pt-2">
            {items.map((item, index) => {
              const amount = amountOf(item.qty) * amountOf(item.rate);
              return (
                <div key={index} className="flex justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0">
                  <span>
                    {item.description || "Item"} · {item.qty} x ${item.rate}
                  </span>
                  <span>${amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-slate-200 pt-4 text-sm sm:grid-cols-2">
            <div className="space-y-0.5 text-slate-600">
              <LineSplit items={items} />
              {payments.some((payment) => amountOf(payment.amount) > 0) && <p className="text-xs text-slate-500">Payments</p>}
              {payments.filter((payment) => amountOf(payment.amount) > 0).map((payment) => (
                <div key={payment.id} className="flex justify-between gap-2">
                  <span>Paid{payment.date ? ` ${payment.date}` : ""}{payment.method ? ` · ${payment.method}` : ""}{payment.ref ? ` · ${payment.ref}` : ""}</span>
                  <span>-${amountOf(payment.amount).toFixed(2)}</span>
                </div>
              ))}
              {paymentLink && <p className="break-all pt-1 text-xs">Pay here: {paymentLink}</p>}
            </div>
            <div className="space-y-1">
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
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
              {totals.paid > 0 && (
                <div className="flex justify-between">
                  <span>Paid</span>
                  <span>-${totals.paid.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-lg font-bold">
                <span>Still owed</span>
                <span>${totals.balance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {notes && <p className="mt-6 whitespace-pre-line text-sm text-slate-600">{notes}</p>}
          <JobPhotoStrip photos={photos} />
          {(payUrlFor(docPayLink, paymentLink) || signature || proposalSignature) && (
            <div className="print-keep mt-3 grid grid-cols-2 items-end gap-6 border-t border-slate-200 pt-3">
              <div className="space-y-3">
                <SignatureBlock signature={proposalSignature} label="Proposal accepted" />
                <SignatureBlock signature={signature} />
              </div>
              <div className="flex justify-end">
                <PayQr url={payUrlFor(docPayLink, paymentLink)} />
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}