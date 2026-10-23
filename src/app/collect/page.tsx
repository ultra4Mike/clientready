"use client";

import { docAmounts } from "@/lib/doc-stage";
import { preferredContactFor } from "@/lib/contact-method";
import EmptyState from "@/components/EmptyState";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StuckPayments from "@/components/StuckPayments";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, effectiveDueDate, nextDueDate, invoicePastDue, methodLabel, isOpenBalance, isVoidStatus, paidTotal, paymentFields, paymentMethods, readPayments } from "@/lib/payments";
import { uniqueDocs } from "@/lib/change-orders";
import { effectiveAmounts } from "@/lib/change-order-revision";
import { isPendingRecurringDraft } from "@/lib/recurring";
import ReminderPanel from "@/components/ReminderPanel";
import { payUrlFor } from "@/lib/pay-link";

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
    discountType?: string;
    discountValue?: string;
    items?: LineItem[];
    paymentMethod?: string;
    paymentDate?: string;
    paymentAmount?: string;
    paymentRef?: string;
    payments?: unknown;
    [key: string]: unknown;
  };
};

const methods = paymentMethods;

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + amountOf(item.qty) * amountOf(item.rate);
  }, 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}

function amountPaid(doc: SavedDocument) {
  return paidTotal(readPayments(doc.data));
}

// Option A: every document on screen, so balance() can apply the change-order chain (set each render).
let chainDocs: SavedDocument[] = [];
function balance(doc: SavedDocument) {
  if (chainDocs.length) return chainBalance(doc, chainDocs);
  if (isVoidStatus(doc.data?.status) || (doc.data as { deleted?: unknown } | undefined)?.deleted) return 0; // void never counts as owed
  // R128: the shared refund-aware owed amount (same as dashboard, Documents, portal): a refund never reopens a balance.
  return docAmounts(doc as never).owed;
}

/** Option A: replaced versions owe nothing here; a revision owes net of all chain payments. */
function chainBalance(doc: SavedDocument, all: SavedDocument[]) {
  if (isVoidStatus(doc.data?.status) || (doc.data as { deleted?: unknown } | undefined)?.deleted) return 0;
  return effectiveAmounts(all as never, doc as never).owed;
}

/** Same rule as the dashboard and Documents (drafts excluded, balance > 0, per installment on payment plans). */
function isOverdue(doc: SavedDocument) {
  return invoicePastDue(doc.data as Record<string, unknown>, invoiceTotal(doc), balance(doc));
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function CollectPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [payingId, setPayingId] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paidDate, setPaidDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paidMessage, setPaidMessage] = useState("");
  const [reminderId, setReminderId] = useState("");
  const [profile, setProfile] = useState<{ businessName?: string; ownerName?: string; paymentLink?: string }>({});

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(uniqueDocs(JSON.parse(raw)));
    try {
      setProfile(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}"));
    } catch {
      setProfile({});
    }
  }, []);

  function saveDocs(next: SavedDocument[]) {
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

  async function saveCloud(doc: SavedDocument) {
    const cloudId = await saveCloudDocument({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      clientName: doc.clientName,
      createdAt: doc.createdAt,
      data: doc.data || {},
    });
    // A never-uploaded doc gets a cloud id on first save; use it so later saves update, not duplicate.
    if (cloudId !== doc.id) {
      const raw = window.localStorage.getItem("clientready-documents");
      const list = (raw ? JSON.parse(raw) : []) as SavedDocument[];
      saveDocs(list.map((item) => (item.id === doc.id ? { ...item, id: cloudId } : item)));
    }
  }

  async function setStatus(id: string, status: string) {
    const next = documents.map((doc) => {
      if (doc.id !== id) return doc;
      return { ...doc, data: { ...(doc.data || {}), status, updatedAt: new Date().toISOString() } };
    });
    saveDocs(next);
    const updated = next.find((doc) => doc.id === id);
    if (updated) await saveCloud(updated);
  }

  function startPaid(doc: SavedDocument) {
    setPayingId(doc.id);
    setMethod("Cash");
    setPaidDate(today());
    setAmount(balance(doc).toFixed(2));
    setPaymentRef("");
    setPaymentNote("");
  }

  async function savePaid(doc: SavedDocument) {
    const next = documents.map((item) => {
      if (item.id !== doc.id) return item;
      const payments = [...readPayments(item.data), { id: Date.now().toString(), amount, method, date: paidDate, ref: paymentRef, ...(paymentNote.trim() ? { note: paymentNote.trim() } : {}) }];
      const stillOwed = balanceDue(invoiceTotal(item), paidTotal(payments));
      return {
        ...item,
        data: {
          ...(item.data || {}),
          ...paymentFields(payments),
          status: stillOwed <= 0 ? "paid" : item.data?.status === "draft" || !item.data?.status ? "sent" : item.data.status,
          updatedAt: new Date().toISOString(),
        },
      };
    });
    saveDocs(next);
    const updated = next.find((item) => item.id === doc.id);
    setPayingId(""); // R111: form closes as soon as it is saved
    setPaidMessage("Payment saved");
    window.setTimeout(() => setPaidMessage(""), 2500);
    if (updated) await saveCloud(updated);
    if (method === "Cash" && updated) {
      window.localStorage.setItem(
        "clientready-receipt",
        JSON.stringify({
          invoiceNumber: updated.title,
          clientName: updated.clientName,
          amount,
          date: paidDate,
          method,
          note: paymentNote.trim(),
        })
      );
      window.location.href = "/receipt?print=1";
    }
  }

  function openInvoice(id: string) {
    window.location.href = `/invoice?id=${encodeURIComponent(id)}`;
  }

  chainDocs = documents;
  const invoices = documents.filter((doc) => doc.type === "invoice");
  // Recurring drafts nobody has reviewed yet are not money to collect: keep them out of the
  // list and totals, and point to them below so they aren't lost.
  const pendingDrafts = invoices.filter(isPendingRecurringDraft).length;
  const unpaid = invoices.filter((doc) => (doc.data?.status || "draft") !== "paid" && isOpenBalance(doc.data?.status, balance(doc)));

  const totals = useMemo(() => {
    const openAmount = unpaid.reduce((sum, doc) => sum + balance(doc), 0);
    const overdueAmount = unpaid.filter(isOverdue).reduce((sum, doc) => sum + balance(doc), 0);
    return { openAmount, overdueAmount, unpaidCount: unpaid.length };
  }, [unpaid]);

  const refLabel =
    method === "Check"
      ? "Check number"
      : method === "Card"
        ? "Last 4 only"
        : method === "Cash"
          ? "From name, optional"
          : "Confirmation or note";

  return (
    <AppShell title="Get paid">
      <PageHeader title="Get paid" subtitle="Unpaid invoices and overdue amounts, with the next step on each one." actions={<a href="/invoice" className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">New invoice +</a>} />
      <StuckPayments />
      {paidMessage && <p role="status" data-testid="payment-saved" className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2 text-sm shadow-lg">{paidMessage}</p>}

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-6">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--cr-muted)] sm:text-xs">Unpaid invoices</p>
          <p className="mt-1 truncate text-base font-bold tabular-nums sm:mt-2 sm:text-2xl">{totals.unpaidCount}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-6">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--cr-muted)] sm:text-xs">Open amount</p>
          <p className="mt-1 truncate text-base font-bold tabular-nums sm:mt-2 sm:text-2xl">${totals.openAmount.toFixed(2)}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-6">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-[var(--cr-muted)] sm:text-xs">Overdue</p>
          <p className="mt-1 truncate text-base font-bold tabular-nums sm:mt-2 sm:text-2xl text-amber-600 dark:text-amber-300">${totals.overdueAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {pendingDrafts > 0 && (
          <p data-testid="recurring-pending-note" className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-[var(--cr-muted)]">
            {pendingDrafts} recurring draft{pendingDrafts === 1 ? "" : "s"} awaiting review, not counted here.{" "}
            <a href="/documents" className="font-medium text-teal-700 underline dark:text-teal-300">Review in Documents</a>
          </p>
        )}
        {unpaid.length === 0 && (
          <EmptyState icon="✓" title="Nothing to collect" line="Unpaid invoices will show here." className="rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)]" />
        )}

        {unpaid.length > 0 && (
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-4 rounded-xl px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)] lg:grid">
            <span>Invoice</span><span className="text-right">Balance</span><span className="w-[27rem] text-right">Actions</span>
          </div>
        )}
        <div className="space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-teal-500/20 lg:bg-[var(--cr-card)] lg:divide-y lg:divide-teal-500/15">
        {unpaid.map((doc) => (
          <div key={doc.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-5 lg:py-4 lg:shadow-none lg:hover:bg-teal-500/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] lg:gap-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">{doc.title}</p>
                <p className="text-sm text-[var(--cr-muted)]">
                  {doc.clientName || "No client"} · {doc.data?.status || "draft"}
                  {effectiveDueDate(doc.data as Record<string, unknown>) ? ` · due ${effectiveDueDate(doc.data as Record<string, unknown>)}` : ""}
                  {isOverdue(doc) ? " · overdue" : ""}
                </p>
              </div>
              <div className="lg:text-right">
                <p className="text-lg font-bold tabular-nums">${balance(doc).toFixed(2)} <span className="text-sm font-medium text-[var(--cr-muted)] lg:hidden">owed</span></p>
                {amountPaid(doc) > 0 && (
                  <p className="text-sm text-[var(--cr-muted)]">
                    ${amountPaid(doc).toFixed(2)} paid of ${invoiceTotal(doc).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:w-[27rem] lg:flex-nowrap lg:justify-end">
                <button type="button" onClick={() => openInvoice(doc.id)} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400 lg:px-3 lg:py-2">
                  Open
                </button>
                {String(doc.data?.status || "draft") === "draft" && <button type="button" onClick={() => setStatus(doc.id, "sent")} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400 lg:px-3 lg:py-2">
                  Mark sent
                </button>}
                <button type="button" data-testid={`reminder-${doc.id}`} onClick={() => setReminderId(reminderId === doc.id ? "" : doc.id)} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400 lg:px-3 lg:py-2">
                  Reminder
                </button>
                <button type="button" onClick={() => startPaid(doc)} className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">
                  Record payment
                </button>
              </div>
            </div>

            {reminderId === doc.id && (
              <ReminderPanel
                prefer={preferredContactFor(doc.data?.clientId, doc.clientName || doc.data?.clientName)}
                input={{
                  clientName: doc.clientName || String(doc.data?.clientName || ""),
                  contactName: String(doc.data?.contactName || ""),
                  clientCompany: String(doc.data?.clientCompany || ""),
                  invoiceNumber: String(doc.data?.invoiceNumber || doc.title || ""),
                  owed: balance(doc),
                  dueDate: nextDueDate(doc.data as Record<string, unknown>, invoiceTotal(doc), balance(doc)),
                  payUrl: payUrlFor(doc.data?.payLink, profile.paymentLink),
                  businessName: profile.businessName || "",
                  ownerName: profile.ownerName || "",
                  today: today(),
                }}
                phone={String(doc.data?.clientPhone || "")}
                email={String(doc.data?.clientEmail || "")}
                onClose={() => setReminderId("")}
              />
            )}

            {payingId === doc.id && (
              <div className="mt-4 grid gap-3 border-t border-teal-500/20 pt-4 sm:grid-cols-2">
                <select
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  {methods.map((item) => (
                    <option key={item} value={item}>
                      {methodLabel(item)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
                  value={paidDate}
                  onChange={(event) => setPaidDate(event.target.value)}
                />
                <input
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
                  placeholder="Amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <input
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
                  placeholder={refLabel}
                  value={paymentRef}
                  onChange={(event) => setPaymentRef(event.target.value)}
                />
                <input
                  data-testid="payment-note"
                  aria-label="Note"
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30 sm:col-span-2"
                  placeholder="Note (optional)"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                />
                <p className="text-xs text-[var(--cr-muted)] sm:col-span-2">
                  Do not enter a full card, account, or routing number.
                </p>
                <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => savePaid(doc)}
                    className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
                  >
                    {method === "Cash" ? "Save and print receipt" : "Save payment"}
                  </button>
                  <button type="button" onClick={() => setPayingId("")} className="rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--cr-muted)] transition hover:bg-teal-500/10">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>
    </AppShell>
  );
}