"use client";

import PayOptions from "@/components/PayOptions";
import { readLocalPaymentMethods, type PaymentMethodsConfig } from "@/lib/payments/providers";
import { StageSchedule } from "@/components/StageSchedule";
import { readStages, type Stage } from "@/lib/stages";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { balanceDue, paidTotal, readPayments, tipTotal, type Payment } from "@/lib/payments";
import { JobPhotoStrip } from "@/components/JobPhotos";
import { readPhotos, type JobPhoto } from "@/lib/photos";
import LineSplit from "@/components/LineSplit";
import ChangeOrderNotes from "@/components/ChangeOrderNotes";
import { changeOrdersFor, mergeChangeOrderNotes, readChangeOrderNotes, readChangeOrderOf, type ChangeOrderNote, type ChangeOrderOf } from "@/lib/change-orders";
import PayQr from "@/components/PayQr";
import { invoiceQrUrl } from "@/lib/pay-link";
import { printOrigin } from "@/lib/site";
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
  const [stages, setStages] = useState<Stage[]>([]);
  const [docPayLink, setDocPayLink] = useState("");
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [changeOrderOf, setChangeOrderOf] = useState<ChangeOrderOf | null>(null);
  const [changeOrderNotes, setChangeOrderNotes] = useState<ChangeOrderNote[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [proposalSignature, setProposalSignature] = useState<Signature | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [status, setStatus] = useState("");
  const [payMethods, setPayMethods] = useState<PaymentMethodsConfig>({});
  useEffect(() => { Promise.resolve().then(() => setPayMethods(readLocalPaymentMethods())); }, []);
  const [businessName, setBusinessName] = useState("");
  const [logo, setLogo] = useState("");
  const [jobTime, setJobTime] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [message, setMessage] = useState("");
  const [approval, setApproval] = useState<Approval | null>(null);
  // "loading" until storage is read; "empty" when no invoice id is given or it isn't found.
  const [viewState, setViewState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    // Read storage after mount (outside the effect body) so the static render and first client render match.
    function load() {
      const profileRaw = window.localStorage.getItem("clientready-profile");
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        setBusinessName(profile.businessName || "");
        setLogo(profile.logo || "");
        setPaymentLink(profile.paymentLink || "");
      }

      const openId = new URLSearchParams(window.location.search).get("id") || window.localStorage.getItem("clientready-open-document");
      const docsRaw = window.localStorage.getItem("clientready-documents");
      const docs = openId && docsRaw ? (JSON.parse(docsRaw) as SavedDocument[]) : [];
      const doc = docs.find((item) => item.id === openId && item.type === "invoice");
      setViewState(doc ? "ready" : "empty");
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
      setStages(doc.type === "invoice" ? readStages((doc.data as Record<string, unknown> | undefined)?.stages) : []);
      setStatus(data.status || "draft");
      setJobTime(data.jobTime || "");
      setApproval(readApproval(doc.data?.approval));
      refreshApproval(doc.id).then((latest) => { if (latest !== undefined) setApproval(latest); });
    }
    Promise.resolve().then(load);
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

  if (viewState !== "ready") {
    return (
      <AppShell title="Invoice">
        <PageHeader title="Invoice" subtitle="View, print or share a saved invoice." />
        <div data-testid="invoice-view-empty" data-state={viewState} className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-14 text-center shadow-sm">
          {viewState === "loading" ? (
            <>
              <span className="h-12 w-12 animate-spin rounded-full border-4 border-teal-500/20 border-t-teal-500" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium text-[var(--cr-muted)]">Loading…</p>
              <div className="mt-6 w-full max-w-sm space-y-2" aria-hidden="true">
                <div className="h-3 animate-pulse rounded bg-teal-500/15" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-teal-500/15" />
                <div className="h-3 w-3/5 animate-pulse rounded bg-teal-500/15" />
              </div>
            </>
          ) : (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/15 text-2xl" aria-hidden="true">🧾</span>
              <p className="mt-4 text-lg font-semibold">No invoice selected</p>
              <p className="mt-1 max-w-sm text-sm text-[var(--cr-muted)]">Open an invoice from your documents to view or print it.</p>
              <div className="mt-6 grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
                <a href="/documents" className="flex min-h-11 items-center justify-center rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Go to Documents</a>
                <a href="/invoice" className="flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-5 py-2.5 text-sm font-medium transition hover:border-teal-400">New invoice</a>
              </div>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Invoice">
      <div className="print-hide mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <a href="/documents" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600 dark:hover:text-teal-300">
          Back to documents
        </a>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-xl border border-teal-500/30 px-4 py-2 text-sm font-medium text-teal-700 transition dark:text-teal-200 hover:border-teal-400/60 hover:bg-teal-500/10"
          >
            Print / Save PDF
          </button>
          {status !== "paid" && (
            <button
              type="button"
              onClick={copyPayLink}
              className="min-h-11 rounded-xl border border-teal-500/30 px-4 py-2 text-sm font-medium text-teal-700 transition dark:text-teal-200 hover:border-teal-400/60 hover:bg-teal-500/10"
            >
              {paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}
            </button>
          )}
          <button
            type="button"
            onClick={editInvoice}
            className="min-h-11 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"
          >
            Edit invoice
          </button>
        </div>
      </div>
      {message && <p className="print-hide mx-auto mb-4 max-w-3xl rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2 text-sm text-[var(--cr-muted)]">{message}</p>}

      <section className="hide-fab print-reset mx-auto max-w-3xl">
        <div id="preview" className="rounded-2xl border border-slate-200 border-t-4 border-t-teal-500 bg-white p-5 text-slate-900 shadow-lg sm:p-10 print:border-t print:border-t-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-sm text-slate-600">
              {logo && <img src={logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
              <p className="font-semibold">{businessName}</p>
              {jobTime && <p>Scheduled time: {jobTime}</p>}
            </div>
            <div className="shrink-0 text-right">
              {approval && <div className="mb-1"><ApprovalBadge approval={approval} /></div>}
              {changeOrderOf && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
              <p className="text-xs uppercase tracking-wide text-slate-500">Invoice · <span data-testid="invoice-status-pill" className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold ${status === "paid" ? "cr-tone-good border-emerald-200 bg-emerald-100 text-emerald-800" : "cr-tone-warn border-amber-200 bg-amber-100 text-amber-800"}`}>{status === "paid" ? "✓ paid" : status}</span></p>
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
                <div key={index} className="flex justify-between gap-4 border-b border-slate-100 py-2.5 text-sm last:border-b-0">
                  <span className="min-w-0 break-words">
                    {item.description || "Item"} · {item.qty} x ${item.rate}
                  </span>
                  <span className="shrink-0 tabular-nums">${amount.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 border-t border-slate-200 pt-4 text-sm tabular-nums sm:grid-cols-2">
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
                <div data-testid="view-discount" className="flex justify-between">
                  <span>{discountLabel(discountType, discountValue)}</span>
                  <span>-${totals.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
              {totals.paid > 0 && (
                <div className="flex justify-between font-medium text-emerald-700 dark:text-emerald-300">
                  <span>Paid</span>
                  <span>-${totals.paid.toFixed(2)}</span>
                </div>
              )}
              {tipTotal(payments) > 0 && (
                <div className="flex justify-between" data-testid="tip-line">
                  <span>Tip received, thank you</span>
                  <span>${tipTotal(payments).toFixed(2)}</span>
                </div>
              )}
              {status === "paid" || (totals.paid > 0 && totals.balance <= 0.004) ? (
                <div data-testid="paid-in-full" className="mt-2 flex items-baseline justify-between cr-tone-good rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-lg font-bold text-emerald-800 print:bg-transparent print:px-0">
                  <span>✓ Paid in full</span>
                  <span>${totals.balance.toFixed(2)}</span>
                </div>
              ) : (
              <div className="mt-2 flex items-baseline justify-between cr-tone-teal rounded-lg bg-teal-50 px-3 py-2 text-lg font-bold text-teal-900 print:bg-transparent print:px-0">
                <span>Still owed</span>
                <span>${totals.balance.toFixed(2)}</span>
              </div>
              )}
            </div>
          </div>

          {status !== "paid" && totals.balance > 0.004 && <PayOptions config={payMethods} amount={totals.balance} reference={invoiceNumber} />}
          <StageSchedule stages={stages} total={totals.total} balance={totals.balance} />
          {notes && <p className="mt-6 whitespace-pre-line text-sm text-slate-600">{notes}</p>}
          <JobPhotoStrip photos={photos} />
          {(invoiceQrUrl(approval?.token, printOrigin(), docPayLink, paymentLink) || signature || proposalSignature) && (
            <div className="print-keep mt-3 grid grid-cols-1 items-end gap-6 sm:grid-cols-2 print:grid-cols-2 border-t border-slate-200 pt-3">
              <div className="space-y-3">
                <SignatureBlock signature={proposalSignature} label="Proposal accepted" />
                <SignatureBlock signature={signature} />
              </div>
              <div className="flex justify-start sm:justify-end print:justify-end">
                <PayQr url={invoiceQrUrl(approval?.token, printOrigin(), docPayLink, paymentLink)} />
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}