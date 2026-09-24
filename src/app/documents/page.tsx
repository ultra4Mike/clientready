"use client";

import { useEffect, useState } from "react";

type SavedDocument = {
  id: string;
  type: "invoice" | "proposal";
  title: string;
  clientName: string;
  createdAt: string;
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) {
      setDocuments(JSON.parse(raw));
    }
  }, []);

  function openDocument(doc: SavedDocument) {
    window.localStorage.setItem("clientready-open-document", doc.id);
    if (doc.type === "invoice") {
      window.location.href = "/invoice";
    } else {
      window.location.href = "/proposal";
    }
  }

  function removeDocument(id: string) {
    const next = documents.filter((doc) => doc.id !== id);
    setDocuments(next);
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  }

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
          Open an invoice or proposal you already saved.
        </p>

        <div className="mt-8 space-y-3">
          {documents.length === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">
              No saved documents yet.
            </p>
          )}

          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div>
                <p className="font-medium">{doc.title}</p>
                <p className="text-sm text-slate-600">
                  {doc.type} · {doc.clientName || "No client"} · {doc.createdAt}
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