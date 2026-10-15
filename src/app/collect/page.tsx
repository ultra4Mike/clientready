"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, paidTotal, paymentFields, paymentMethods, readPayments } from "@/lib/payments";

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

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(JSON.parse(raw));
  }, []);

  function saveDocs(next: SavedDocument[]) {
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

  async function saveCloud(doc: SavedDocument) {
    await saveCloudDocument({
      id: doc.id,
      type: doc.type,
      title: doc.title,
      clientName: doc.clientName,
      createdAt: doc.createdAt,
      data: doc.data || {},
    });
  }

  async function setStatus(id: string, status: string) {
    const next = documents.map((doc) => {
      if (doc.id !== id) return doc;
      return { ...doc, data: { ...(doc.data || {}), status } };
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
  const unpaid = invoices.filter((doc) => (doc.data?.status || "draft") !== "paid");

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
      <p className="text-[var(--cr-muted)]">Unpaid invoices and overdue amounts.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Unpaid invoices</p>
          <p className="mt-2 text-2xl font-semibold">{totals.unpaidCount}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Open amount</p>
          <p className="mt-2 text-2xl font-semibold">${totals.openAmount.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-[var(--cr-muted)]">Overdue</p>
          <p className="mt-2 text-2xl font-semibold">${totals.overdueAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {unpaid.length === 0 && (
          <p className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 text-[var(--cr-muted)]">
            Nothing to collect. Unpaid invoices will show here.
          </p>
        )}

        {unpaid.map((doc) => (
          <div key={doc.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-[var(--cr-muted)]">
                  {doc.clientName || "No client"} · {doc.data?.status || "draft"}
                  {doc.data?.dueDate ? ` · due ${doc.data.dueDate}` : ""}
                  {isOverdue(doc) ? " · overdue" : ""}
                </p>
                <p className="mt-1 font-semibold">${balance(doc).toFixed(2)} owed</p>
                {amountPaid(doc) > 0 && (
                  <p className="text-sm text-[var(--cr-muted)]">
                    ${amountPaid(doc).toFixed(2)} paid of ${invoiceTotal(doc).toFixed(2)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => openInvoice(doc.id)} className="text-sm font-medium">
                  Open
                </button>
                <button type="button" onClick={() => setStatus(doc.id, "sent")} className="text-sm font-medium">
                  Mark sent
                </button>
                <button type="button" onClick={() => startPaid(doc)} className="text-sm font-medium">
                  Record payment
                </button>
              </div>
            </div>

            {payingId === doc.id && (
              <div className="mt-4 grid gap-3 border-t border-teal-500/20 pt-4 sm:grid-cols-2">
                <select
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2"
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
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2"
                  value={paidDate}
                  onChange={(event) => setPaidDate(event.target.value)}
                />
                <input
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2"
                  placeholder="Amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <input
                  className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2"
                  placeholder={refLabel}
                  value={paymentRef}
                  onChange={(event) => setPaymentRef(event.target.value)}
                />
                <p className="text-sm text-[var(--cr-muted)] sm:col-span-2">
                  Do not enter a full card, account, or routing number.
                </p>
                <div className="flex gap-3 sm:col-span-2">
                  <button
                    type="button"
                    onClick={() => savePaid(doc)}
                    className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950"
                  >
                    {method === "Cash" ? "Save and print receipt" : "Save payment"}
                  </button>
                  <button type="button" onClick={() => setPayingId("")} className="text-sm">
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