"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchCloudDocuments, deleteCloudDocument, getUserId } from "@/lib/cloud-docs";
import { mergeDocs, OWNER_KEY } from "@/lib/doc-sync";
import { runDueRecurring } from "@/lib/recurring";
import { ApprovalBadge } from "@/components/Approval";
import { readApproval } from "@/lib/approval";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { documentTotals } from "@/lib/discount";
import { documentStage, NEXT_LABEL, STAGE_LABEL } from "@/lib/doc-stage";
import { balanceDue, isOpenBalance, paidTotal, readPayments } from "@/lib/payments";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredSearch = useDeferredValue(search);
  const stages = useMemo(() => new Map(documents.map((doc) => [doc.id, documentStage(doc, documents)])), [documents]);
  const stageOf = (doc: SavedDocument) => stages.get(doc.id) || documentStage(doc, documents);

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
    // Nor is it another period of a recurring schedule (one draft per period), or already reviewed.
    const { approval: _approval, schedule: _schedule, recurringFrom: _from, recurringReview: _review, reviews: _reviews, ...rest } = (doc.data || {}) as Record<string, unknown>;
    void _approval;
    void _schedule;
    void _from;
    void _review;
    void _reviews;
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
        if (doc.type !== "invoice" || !isOpenBalance(status, info.owed)) return false;
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
    <AppShell title="All documents">
      <PageHeader
        title="All documents"
        subtitle="Invoices and proposals live here. Press Open to edit one."
        actions={<>
          <a
              href="/invoice"
              className="rounded-full bg-teal-500 px-4 py-2 text-center text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"
            >
              New invoice
            </a>
            <a
              href="/proposal"
              className="rounded-full border border-teal-500/40 px-4 py-2 text-center text-sm font-medium transition hover:border-teal-400"
            >
              New proposal
            </a>
        </>}
      />

      <div className="grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="sm:col-span-2 lg:col-span-4 rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          placeholder="Search client, number, amount, email"
          aria-label="Search documents"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} className="flex min-h-11 items-center justify-between rounded-lg border border-teal-500/30 px-3 text-sm font-medium sm:hidden">
          <span>Filters{typeFilter !== "all" || statusFilter !== "all" || fromDate || toDate ? " · on" : ""}</span><span aria-hidden="true" className={`transition ${filtersOpen ? "rotate-90" : ""}`}>›</span>
        </button>
        <div className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:contents`}>
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
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--cr-muted)]">
        <span data-testid="doc-count">{visibleDocs.length} of {documents.length} documents</span>
        {filtersOn && <button type="button" className="font-medium text-teal-600 dark:text-teal-300" onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all"); setFromDate(""); setToDate(""); }}>Clear filters</button>}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] shadow-sm">
        <div className="hidden gap-4 border-b border-teal-500/20 bg-teal-500/5 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)] md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7.5rem_7rem_7.5rem_13rem]">
          <span>Document</span><span>Client</span><span>Created</span><span>Status</span><span className="text-right">Total</span><span className="text-right">Actions</span>
        </div>
        {documents.length === 0 && (
          <div className="p-10 text-center">
            <p className="font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">
              Create your first invoice or proposal.
            </p>
          </div>
        )}

        {documents.length > 0 && visibleDocs.length === 0 && (
          <p className="p-10 text-center text-sm text-[var(--cr-muted)]">
            No documents match that search.
          </p>
        )}

        {visibleDocs.map((doc) => (
          <div
            key={doc.id}
            data-testid="doc-row"
            data-stage={stageOf(doc).stage}
            data-next-action={stageOf(doc).next}
            title={`${STAGE_LABEL[stageOf(doc).stage]}${NEXT_LABEL[stageOf(doc).next] ? ` · Next: ${NEXT_LABEL[stageOf(doc).next]}` : ""}`}
            className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-teal-500/10 px-4 py-4 transition last:border-b-0 hover:bg-teal-500/5 md:items-center md:px-5 md:py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7.5rem_7rem_7.5rem_13rem]"
          >
            <button type="button" onClick={() => openDocument(doc)} className="col-span-2 min-w-0 text-left md:col-span-1">
              <p className="truncate text-base font-semibold md:text-sm">{doc.title || "Untitled"}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--cr-muted)]">
                <span className="capitalize">{doc.type}</span>
                <span aria-hidden="true">·</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${({ draft: "border-slate-400/40 bg-slate-400/10", sent: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300", approved: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300", scheduled: "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300", invoiced: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300", paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" } as Record<string, string>)[stageOf(doc).stage] || "border-slate-400/40"}`}>{STAGE_LABEL[stageOf(doc).stage]}</span>
                {NEXT_LABEL[stageOf(doc).next] ? <span className="text-teal-700 dark:text-teal-300">Next: {NEXT_LABEL[stageOf(doc).next]}</span> : null}
              </p>
              <ApprovalBadge approval={readApproval(doc.data?.approval)} className="mt-1" />
            </button>
            <div className="min-w-0 text-sm">
              <p className="truncate">{doc.clientName || "No client"}</p>
              {doc.data?.outcome ? <p className="truncate text-xs text-[var(--cr-muted)]">{doc.data.outcome}</p> : null}
            </div>
            <p className="text-right text-sm tabular-nums text-[var(--cr-muted)] md:text-left">{doc.createdAt}</p>
            <div><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${({ paid: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", draft: "border-slate-400/40 bg-slate-400/15", sent: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300", overdue: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300", accepted: "border-teal-500/40 bg-teal-500/15 text-teal-700 dark:text-teal-300" } as Record<string, string>)[String(doc.data?.status || "")] || "border-teal-500/30"}`}>{String(doc.data?.status || "—")}</span></div>
            <div className="text-right text-sm tabular-nums">
              <p className="font-semibold">{(factsById.get(doc.id)?.total || 0) > 0 ? `$${(factsById.get(doc.id)?.total || 0).toFixed(2)}` : "—"}</p>
              {(factsById.get(doc.id)?.owed || 0) > 0 && doc.data?.status !== "draft" ? <p className="text-xs text-amber-600 dark:text-amber-300">${(factsById.get(doc.id)?.owed || 0).toFixed(2)} owed</p> : null}
            </div>
            <div className="tap-row col-span-2 flex justify-end gap-2 border-t border-teal-500/10 pt-3 md:col-span-1 md:border-0 md:pt-0">
              <button type="button" onClick={() => openDocument(doc)} className="rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-semibold text-slate-950! transition hover:bg-teal-400 max-md:min-h-11 max-md:flex-1">
                Open
              </button>
              <button type="button" onClick={() => duplicateDocument(doc)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium transition hover:border-teal-400 max-md:min-h-11 max-md:flex-1">
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeDocument(doc.id)}
                className="rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 max-md:min-h-11 dark:text-rose-300"
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