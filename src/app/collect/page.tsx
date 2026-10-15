"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, isOpenBalance, paidTotal, paymentFields, paymentMethods, readPayments } from "@/lib/payments";
import { uniqueDocs } from "@/lib/change-orders";
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

function balance(doc: SavedDocument) {
  return balanceDue(invoiceTotal(doc), amountPaid(doc), doc.data?.status);
}

function isOverdue(doc: SavedDocument) {
  const due = doc.data?.dueDate;
  const status = doc.data?.status || "draft";
  if (!due || status === "paid") return false;
  if (status === "overdue") return true;
  return new Date(`${due}T23:59:59`) < new Date();
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
  }

  async function savePaid(doc: SavedDocument) {
    const next = documents.map((item) => {
      if (item.id !== doc.id) return item;
      const payments = [...readPayments(item.data), { id: Date.now().toString(), amount, method, date: paidDate, ref: paymentRef }];
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
    if (updated) await saveCloud(updated);
    setPayingId("");
    if (method === "Cash" && updated) {
      window.localStorage.setItem(
        "clientready-receipt",
        JSON.stringify({
          invoiceNumber: updated.title,
          clientName: updated.clientName,
          amount,
          date: paidDate,
          method,
        })
      );
      window.location.href = "/receipt";
    }
  }

  function openInvoice(id: string) {
    window.location.href = `/invoice?id=${encodeURIComponent(id)}`;
  }

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
    <AppShell title="Collect">
      <PageHeader title="Get paid" subtitle="Unpaid invoices and overdue amounts, with the next step on each one." actions={<a href="/invoice" className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">New invoice +</a>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Unpaid invoices</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totals.unpaidCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Open amount</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">${totals.openAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Overdue</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300">${totals.overdueAmount.toFixed(2)}</p>
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
          <p className="rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] p-8 text-center text-sm text-[var(--cr-muted)]">
            Nothing to collect. Unpaid invoices will show here.
          </p>
        )}

        {unpaid.map((doc) => (
          <div key={doc.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold">{doc.title}</p>
                <p className="text-sm text-[var(--cr-muted)]">
                  {doc.clientName || "No client"} · {doc.data?.status || "draft"}
                  {doc.data?.dueDate ? ` · due ${doc.data.dueDate}` : ""}
                  {isOverdue(doc) ? " · overdue" : ""}
                </p>
                <p className="mt-2 text-lg font-bold tabular-nums">${balance(doc).toFixed(2)} <span className="text-sm font-medium text-[var(--cr-muted)]">owed</span></p>
                {amountPaid(doc) > 0 && (
                  <p className="text-sm text-[var(--cr-muted)]">
                    ${amountPaid(doc).toFixed(2)} paid of ${invoiceTotal(doc).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={() => openInvoice(doc.id)} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400">
                  Open
                </button>
                <button type="button" onClick={() => setStatus(doc.id, "sent")} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400">
                  Mark sent
                </button>
                <button type="button" data-testid={`reminder-${doc.id}`} onClick={() => setReminderId(reminderId === doc.id ? "" : doc.id)} className="rounded-lg border border-teal-500/30 px-4 py-2.5 text-sm font-medium transition hover:border-teal-400">
                  Reminder
                </button>
                <button type="button" onClick={() => startPaid(doc)} className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">
                  Record payment
                </button>
              </div>
            </div>

            {reminderId === doc.id && (
              <ReminderPanel
                input={{
                  clientName: doc.clientName || String(doc.data?.clientName || ""),
                  invoiceNumber: String(doc.data?.invoiceNumber || doc.title || ""),
                  owed: balance(doc),
                  dueDate: String(doc.data?.dueDate || ""),
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
                      {item}
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
    </AppShell>
  );
}