"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchCloudDocuments, deleteCloudDocument, getUserId } from "@/lib/cloud-docs";
import { mergeDocs, OWNER_KEY } from "@/lib/doc-sync";
import { runDueRecurring } from "@/lib/recurring";
import { ApprovalBadge } from "@/components/Approval";
import { readApproval } from "@/lib/approval";
import AppShell from "@/components/AppShell";
import { documentTotals } from "@/lib/discount";
import { balanceDue, paidTotal, readPayments } from "@/lib/payments";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { searchWithNumbers } from "@/lib/doc-number";

type SavedDocument = {
  id: string;
  type: "invoice" | "proposal" | "email" | "report";
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    style?: string;
    outcome?: string;
    [key: string]: unknown;
  };
};

function num(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

/** Amounts and dates used by search and filters (computed once per document list). */
function facts(doc: SavedDocument) {
  const data = doc.data || {};
  const items = Array.isArray(data.items) ? (data.items as { qty?: unknown; rate?: unknown }[]) : [];
  const subtotal = items.reduce((sum, item) => sum + num(item.qty) * num(item.rate), 0);
  const total = documentTotals(subtotal, data.taxPercent as string, data.discountType as string, data.discountValue as string).total;
  const owed = doc.type === "invoice" ? balanceDue(total, paidTotal(readPayments(data)), data.status) : 0;
  const created = Date.parse(doc.createdAt);
  const date = String(data.invoiceDate || "") || (Number.isNaN(created) ? "" : new Date(created).toISOString().slice(0, 10));
  const updated = Date.parse(String(data.updatedAt || ""));
  const stamp = !Number.isNaN(updated) ? updated : Number(doc.id) || (Number.isNaN(created) ? 0 : created);
  const text = [doc.title, doc.clientName, doc.type, data.invoiceNumber, data.clientCompany, data.clientEmail, data.clientPhone, data.status, date, total.toFixed(2)].join(" ").toLowerCase();
  return { total, owed, date, stamp, text };
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") || "";
    if (query) setSearch(query);
    // Links from the dashboard cards: /documents?filter=outstanding|paid|overdue|unpaid
    const preset = params.get("filter") || "";
    if (["outstanding", "unpaid", "paid", "overdue"].includes(preset)) {
      setTypeFilter("invoice");
      setStatusFilter(preset);
    }

    async function load() {
      await syncDocs();
      // No server cron: due recurring drafts are made when the app opens.
      if (await runDueRecurring()) {
        const raw = window.localStorage.getItem("clientready-documents");
        setDocuments(raw ? JSON.parse(raw) : []);
      }
    }

    async function syncDocs() {
      const raw = window.localStorage.getItem("clientready-documents");
      const local = raw ? JSON.parse(raw) : [];
      if (local.length) setDocuments(local);

      const cloud = await fetchCloudDocuments();
      if (!cloud) return; // signed out or fetch failed: keep local as is
      // Cache belongs to another account: the dashboard sync handles switching, so don't mix them here.
      const owner = window.localStorage.getItem(OWNER_KEY);
      if (owner && owner !== (await getUserId())) return;

      // Same merge as the dashboard: keep local-only docs, newer copy wins for docs in both.
      const { merged } = mergeDocs<SavedDocument>(local, cloud as SavedDocument[]);
      setDocuments(merged);
      window.localStorage.setItem("clientready-documents", JSON.stringify(merged));
    }
    load();
  }, []);

  function saveList(next: SavedDocument[]) {
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

    function openDocument(doc: SavedDocument) {
    window.localStorage.setItem("clientready-open-document", doc.id);
    window.location.href = `/invoice?id=${encodeURIComponent(doc.id)}`;
  }

  function duplicateDocument(doc: SavedDocument) {
    // A copy is a new document: it must not share the original's approval link.
    // A copy is a new job too: it isn't on the schedule yet.
    const { approval: _approval, schedule: _schedule, ...rest } = doc.data || {};
    void _approval;
    void _schedule;
    const copy: SavedDocument = {
      ...doc,
      id: Date.now().toString(),
      title: `${doc.title} copy`,
      createdAt: new Date().toLocaleDateString(),
      data: {
        ...rest,
        status: "draft",
      },
    };
    saveList([copy, ...documents]);
  }

  function removeDocument(id: string) {
    const ok = window.confirm("Are you sure you want to delete this document?");
    if (!ok) return;
    saveList(documents.filter((doc) => doc.id !== id));
    deleteCloudDocument(id);
  }

  const factsById = useMemo(() => new Map(documents.map((doc) => [doc.id, facts(doc)])), [documents]);

  const visibleDocs = useMemo(() => {
    // Words must all match; a number like "450" or "$450.00" also matches the document total.
    const words = deferredSearch.toLowerCase().replace(/\$/g, "").split(/\s+/).filter(Boolean);
    const filtered = documents.filter((doc) => {
      const info = factsById.get(doc.id) || facts(doc);
      if (typeFilter !== "all" && doc.type !== typeFilter) return false;
      const status = String(doc.data?.status || "draft");
      if (statusFilter === "outstanding") {
        // Same rule as the dashboard's Total outstanding card.
        if (doc.type !== "invoice" || isPendingRecurringDraft(doc) || info.owed <= 0) return false;
      } else if (statusFilter === "unpaid" ? !(doc.type === "invoice" && info.owed > 0 && status !== "draft") : statusFilter !== "all" && status !== statusFilter) return false;
      if (fromDate && (!info.date || info.date < fromDate)) return false;
      if (toDate && (!info.date || info.date > toDate)) return false;
      return true;
    });
    const searched = searchWithNumbers(filtered, deferredSearch, (doc) => doc.data?.invoiceNumber || doc.title, (doc) => {
      const info = factsById.get(doc.id) || facts(doc);
      return words.every((word) => info.text.includes(word) || (/^\d+(\.\d+)?$/.test(word) && Math.abs(info.total - Number(word)) < 0.005));
    });

    return searched.sort((a, b) => {
      const fa = factsById.get(a.id) || facts(a);
      const fb = factsById.get(b.id) || facts(b);
      if (sortBy === "client") return a.clientName.localeCompare(b.clientName);
      if (sortBy === "type") return a.type.localeCompare(b.type);
      if (sortBy === "amount") return fb.total - fa.total;
      if (sortBy === "date") return fb.date.localeCompare(fa.date);
      if (sortBy === "oldest") return fa.stamp - fb.stamp;
      return fb.stamp - fa.stamp;
    });
  }, [documents, factsById, typeFilter, statusFilter, fromDate, toDate, sortBy, deferredSearch]);

  const field = "rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";
  const filtersOn = typeFilter !== "all" || statusFilter !== "all" || fromDate || toDate || search;

  return (
    <AppShell title="Documents">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--cr-muted)] sm:text-base">
          Invoices and proposals live here. Press Open to edit one.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <a
            href="/invoice"
            className="rounded-full bg-teal-500 px-4 py-2 text-center text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-500"
          >
            New invoice
          </a>
          <a
            href="/proposal"
            className="rounded-full border border-teal-500/40 px-4 py-2 text-center text-sm font-medium transition hover:border-teal-400"
          >
            New proposal
          </a>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="sm:col-span-2 lg:col-span-4 rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          placeholder="Search client, number, amount, email"
          aria-label="Search documents"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="all">All types</option>
          <option value="invoice">Invoices</option>
          <option value="proposal">Proposals</option>
          <option value="email">Emails</option>
          <option value="report">Reports</option>
        </select>
        <select
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="client">Client name</option>
          <option value="type">Document type</option>
          <option value="date">Document date</option>
          <option value="amount">Amount</option>
        </select>
        <select className={field} aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Any status</option>
          <option value="outstanding">Outstanding (balance due)</option>
          <option value="unpaid">Unpaid, sent (still owed)</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="accepted">Accepted</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--cr-muted)]">From<input type="date" aria-label="From date" className={`${field} min-w-0 flex-1`} value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-[var(--cr-muted)]">To<input type="date" aria-label="To date" className={`${field} min-w-0 flex-1`} value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--cr-muted)]">
        <span data-testid="doc-count">{visibleDocs.length} of {documents.length} documents</span>
        {filtersOn && <button type="button" className="font-medium text-teal-600 dark:text-teal-300" onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setFromDate(""); setToDate(""); }}>Clear filters</button>}
      </div>

      <div className="mt-6 space-y-3">
        {documents.length === 0 && (
          <div className="rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] p-8 text-center">
            <p className="font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">
              Create your first invoice or proposal.
            </p>
          </div>
        )}

        {documents.length > 0 && visibleDocs.length === 0 && (
          <p className="rounded-2xl border border-dashed border-teal-500/30 p-8 text-center text-sm text-[var(--cr-muted)]">
            No documents match that search.
          </p>
        )}

        {visibleDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm transition hover:border-teal-400/50 sm:p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <button type="button" onClick={() => openDocument(doc)} className="min-w-0 text-left">
              <p className="truncate text-base font-semibold">{doc.title || "Untitled"}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-[var(--cr-text)] opacity-85">
                {doc.type} · {doc.clientName || "No client"} · {doc.createdAt}
                {doc.data?.status ? <> · <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${({ paid: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", draft: "border-slate-400/40 bg-slate-400/15", sent: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300", overdue: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300", accepted: "border-teal-500/40 bg-teal-500/15 text-teal-700 dark:text-teal-300" } as Record<string, string>)[String(doc.data.status)] || "border-teal-500/30"}`}>{String(doc.data.status)}</span></> : ""}
                {(factsById.get(doc.id)?.total || 0) > 0 ? ` · $${(factsById.get(doc.id)?.total || 0).toFixed(2)}` : ""}
                {(factsById.get(doc.id)?.owed || 0) > 0 && doc.data?.status !== "draft" ? ` · $${(factsById.get(doc.id)?.owed || 0).toFixed(2)} owed` : ""}
                {doc.data?.outcome ? ` · ${doc.data.outcome}` : ""}
              </p>
              <ApprovalBadge approval={readApproval(doc.data?.approval)} className="mt-1" />
            </button>
            <div className="tap-row flex shrink-0 gap-4 border-t border-teal-500/10 pt-3 sm:border-0 sm:pt-0">
              <button type="button" onClick={() => openDocument(doc)} className="text-sm font-medium text-teal-600 transition hover:underline dark:text-teal-300">
                Open
              </button>
              <button type="button" onClick={() => duplicateDocument(doc)} className="text-sm font-medium text-teal-600 transition hover:underline dark:text-teal-300">
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeDocument(doc.id)}
                className="text-sm text-[var(--cr-muted)] transition hover:text-red-500"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}