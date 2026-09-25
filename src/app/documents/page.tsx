"use client";

import { useEffect, useMemo, useState } from "react";

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
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) {
      setDocuments(JSON.parse(raw));
    }
  }, []);

  function saveList(next: SavedDocument[]) {
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

  function openDocument(doc: SavedDocument) {
    window.localStorage.setItem("clientready-open-document", doc.id);
    if (doc.type === "invoice") window.location.href = "/invoice";
    else if (doc.type === "proposal") window.location.href = "/proposal";
    else if (doc.type === "email") window.location.href = "/email";
    else window.location.href = "/report";
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">Documents</div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">Saved documents</h1>
        <p className="mt-2 text-slate-600">
          Search, filter, and sort your saved documents.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Search title or client"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2"
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
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="client">Client name</option>
            <option value="type">Document type</option>
          </select>
        </div>

        <div className="mt-8 space-y-3">
          {visibleDocs.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              No documents match that search.
            </p>
          )}

          {visibleDocs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-slate-600">
                  {doc.type} · {doc.clientName || "No client"} · {doc.createdAt}
                  {doc.data?.status ? ` · ${doc.data.status}` : ""}
                  {doc.data?.outcome ? ` · ${doc.data.outcome}` : ""}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => openDocument(doc)}
                  className="text-sm font-medium"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => duplicateDocument(doc)}
                  className="text-sm font-medium"
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  className="text-sm text-slate-500"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}