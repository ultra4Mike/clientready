"use client";

import { useEffect, useState } from "react";
import { fetchPortal, portalDocUrl, type PortalBusiness, type PortalDoc } from "@/lib/portal";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, paidTotal, readPayments } from "@/lib/payments";
import { readApproval } from "@/lib/approval";

const text = (value: unknown) => (typeof value === "string" ? value : "");

function figures(doc: PortalDoc) {
  const items = Array.isArray(doc.data.items) ? (doc.data.items as { qty?: string; rate?: string }[]) : [];
  const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
  const total = documentTotals(subtotal, text(doc.data.taxPercent), text(doc.data.discountType), text(doc.data.discountValue)).total;
  const paid = paidTotal(readPayments(doc.data));
  return { total, paid, owed: doc.type === "invoice" ? balanceDue(total, paid, doc.data.status) : 0 };
}

/** Public, no-login client portal: every sent invoice/proposal for one client of one business. */
export default function PortalPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [portal, setPortal] = useState<{ clientName: string; business: PortalBusiness; documents: PortalDoc[] } | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    fetchPortal(t)
      .then((found) => {
        setToken(t);
        if (!found) return setState("missing");
        setPortal(found);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state !== "ready" || !portal) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center text-slate-700">
        <h1 className="text-xl font-semibold" data-testid="portal-state">
          {state === "loading" ? "Loading…" : state === "missing" ? "This link is not valid" : "Could not load your documents"}
        </h1>
        {state === "missing" && <p className="mt-2 text-sm">It may have been turned off or replaced. Ask the sender for a new link.</p>}
        {state === "error" && <p className="mt-2 text-sm">Check your connection and reload the page.</p>}
      </main>
    );
  }

  const rows = portal.documents.map((doc) => ({ doc, ...figures(doc), approval: readApproval(doc.data.approval) }));
  const owed = rows.reduce((sum, row) => sum + row.owed, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:px-4 sm:py-10">
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL logo from the profile */}
          {portal.business.logo && <img src={portal.business.logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
          <p className="text-sm font-semibold text-slate-600">{portal.business.name}</p>
          <h1 className="text-2xl font-bold tracking-tight">Documents for {portal.clientName}</h1>
          <p className="mt-1 text-sm text-slate-600">{[portal.business.email, portal.business.phone].filter(Boolean).join(" · ")}</p>
          <p className="mt-3 text-lg font-semibold" data-testid="portal-owed">Total still owed: ${owed.toFixed(2)}</p>
        </div>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="portal-list">
          {rows.length === 0 && <p className="p-5 text-sm text-slate-600">Nothing has been shared yet.</p>}
          {rows.map(({ doc, total, paid, owed: rowOwed, approval }) => (
            <a key={doc.id} href={portalDocUrl(token, doc.id)} data-testid="portal-doc" className="flex items-center justify-between gap-3 p-4 transition hover:bg-slate-50">
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{doc.type === "proposal" ? "Proposal" : "Invoice"}</span>
                <span className="block font-semibold">{text(doc.data.invoiceNumber) || doc.title}</span>
                <span className="block text-xs text-slate-600">
                  {text(doc.data.invoiceDate)}{text(doc.data.dueDate) ? ` · ${doc.type === "proposal" ? "valid until" : "due"} ${text(doc.data.dueDate)}` : ""}
                  {approval?.status === "approved" ? " · Approved" : approval ? " · Waiting for your approval" : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                <span className="block font-semibold">${total.toFixed(2)}</span>
                {doc.type === "invoice" && <span className="block text-xs text-slate-600">{rowOwed > 0 ? `$${rowOwed.toFixed(2)} owed` : paid > 0 ? "Paid" : ""}</span>}
              </span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
