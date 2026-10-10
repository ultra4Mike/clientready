"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCloudDocuments, deleteCloudDocument } from "@/lib/cloud-docs";
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
      const raw = window.localStorage.getItem("clientready-documents");
      const local = raw ? JSON.parse(raw) : [];
      if (local.length) setDocuments(local);

      const cloud = await loadCloudDocuments();
      if (!cloud.length) return;

      const byId = new Map();
      [...local, ...cloud].forEach((doc: { id: string }) => {
        byId.set(doc.id, doc);
      });
      const merged = Array.from(byId.values());
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
    window.location.href = "/invoice";
  }

  function duplicateDocument(doc: SavedDocument) {
    const copy: SavedDocument = {
      ...doc,
      id: Date.now().toString(),
      title: `${doc.title} copy`,
      createdAt: new Date().toLocaleDateString(),
      data: {
        ...(doc.data || {}),
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
        <p className="text-[var(--cr-muted)]">
          Invoices and proposals live here. Click a row to edit it.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/invoice"
            className="rounded-full border border-teal-400 px-4 py-2 text-sm text-teal-300"
          >
            New invoice
          </a>
          <a
            href="/proposal"
            className="rounded-full border border-teal-500/40 px-4 py-2 text-sm"
          >
            New proposal
          </a>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2"
          placeholder="Search title or client"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2"
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
          className="rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2"
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
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="font-medium">No documents yet</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">
              Create your first invoice or proposal.
            </p>
          </div>
        )}

        {documents.length > 0 && visibleDocs.length === 0 && (
          <p className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 text-[var(--cr-muted)]">
            No documents match that search.
          </p>
        )}

        {visibleDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <button type="button" onClick={() => openDocument(doc)} className="text-left">
              <p className="font-medium">{doc.title || "Untitled"}</p>
              <p className="text-sm text-[var(--cr-muted)]">
                {doc.type} · {doc.clientName || "No client"} · {doc.createdAt}
                {doc.data?.status ? ` · ${doc.data.status}` : ""}
                {doc.data?.outcome ? ` · ${doc.data.outcome}` : ""}
              </p>
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={() => openDocument(doc)} className="text-sm font-medium">
                Open
              </button>
              <button type="button" onClick={() => duplicateDocument(doc)} className="text-sm font-medium">
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeDocument(doc.id)}
                className="text-sm text-[var(--cr-muted)]"
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