"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCloudDocuments, deleteCloudDocument, getUserId } from "@/lib/cloud-docs";
import { mergeDocs, OWNER_KEY } from "@/lib/doc-sync";
import { runDueRecurring } from "@/lib/recurring";
import { ApprovalBadge } from "@/components/Approval";
import { readApproval } from "@/lib/approval";
import AppShell from "@/components/AppShell";

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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") || "";
    if (query) setSearch(query);

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

  const visibleDocs = useMemo(() => {
    const filtered = documents.filter((doc) => {
      const matchesType = typeFilter === "all" || doc.type === typeFilter;
      const haystack = `${doc.title} ${doc.clientName} ${doc.type}`.toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "client") return a.clientName.localeCompare(b.clientName);
      if (sortBy === "type") return a.type.localeCompare(b.type);
      if (sortBy === "oldest") return Number(a.id) - Number(b.id);
      return Number(b.id) - Number(a.id);
    });
  }, [documents, typeFilter, sortBy, search]);

  return (
    <AppShell title="Documents">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--cr-muted)] sm:text-base">
          Invoices and proposals live here. Click a row to edit it.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <a
            href="/invoice"
            className="rounded-full bg-teal-400 px-4 py-2 text-center text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-300"
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

      <div className="grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]">
        <input
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30"
          placeholder="Search title or client"
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
        </select>
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
              <p className="mt-0.5 text-sm capitalize text-[var(--cr-muted)]">
                {doc.type} · {doc.clientName || "No client"} · {doc.createdAt}
                {doc.data?.status ? ` · ${doc.data.status}` : ""}
                {doc.data?.outcome ? ` · ${doc.data.outcome}` : ""}
              </p>
              <ApprovalBadge approval={readApproval(doc.data?.approval)} className="mt-1" />
            </button>
            <div className="flex shrink-0 gap-4 border-t border-teal-500/10 pt-3 sm:border-0 sm:pt-0">
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