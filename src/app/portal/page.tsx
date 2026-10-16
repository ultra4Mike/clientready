"use client";

import { useEffect, useState } from "react";
import LegalLinks from "@/components/LegalLinks";
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
        {state === "loading" && <div aria-hidden="true" className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500 motion-reduce:animate-none" />}
        <h1 className="text-xl font-semibold" data-testid="portal-state">
          {state === "loading" ? "Loading…" : state === "missing" ? "This link is not valid" : "Could not load your documents"}
        </h1>
        {state === "missing" && <p className="mt-2 text-sm">It may have been turned off or replaced. Ask the sender for a new link.</p>}
        {state === "error" && <p className="mt-2 text-sm">Check your connection and reload the page.</p>}
        <LegalLinks className="mt-8 text-center" />
      </main>
    );
  }

  const rows = portal.documents.map((doc) => ({ doc, ...figures(doc), approval: readApproval(doc.data.approval) }));
  const owed = rows.reduce((sum, row) => sum + row.owed, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:px-4 sm:py-10">
      <section className="mx-auto max-w-3xl space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-teal-400 to-teal-600" aria-hidden="true" />
          <div className="p-5 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL logo from the profile */}
          {portal.business.logo && <img src={portal.business.logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
          <p className="text-sm font-semibold text-slate-600">{portal.business.name}</p>
          <h1 className="text-2xl font-bold tracking-tight">Documents for {portal.clientName}</h1>
          <p className="mt-1 text-sm text-slate-600">{[portal.business.email, portal.business.phone].filter(Boolean).join(" · ")}</p>
          <p className={`mt-4 inline-flex flex-wrap items-baseline gap-x-2 rounded-xl px-4 py-3 text-lg font-semibold ${owed > 0 ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"}`} data-testid="portal-owed">Total still owed: <span className="text-2xl font-bold tabular-nums">${owed.toFixed(2)}</span></p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="portal-list">
          {rows.length === 0 && <p className="p-5 text-sm text-slate-600">Nothing has been shared yet.</p>}
          {rows.map(({ doc, total, paid, owed: rowOwed, approval }) => (
            <a key={doc.id} href={portalDocUrl(token, doc.id)} data-testid="portal-doc" className="flex min-h-16 items-center justify-between gap-3 p-4 transition hover:bg-slate-50 sm:px-5">
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{doc.type === "proposal" ? "Proposal" : "Invoice"}</span>
                <span className="block font-semibold">{text(doc.data.invoiceNumber) || doc.title}</span>
                <span className="block text-xs text-slate-600">
                  {text(doc.data.invoiceDate)}{text(doc.data.dueDate) ? ` · ${doc.type === "proposal" ? "valid until" : "due"} ${text(doc.data.dueDate)}` : ""}
                  {approval?.status === "approved" ? " · Approved" : approval ? " · Waiting for your approval" : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm">
                <span className="block font-semibold tabular-nums">${total.toFixed(2)}</span>
                {doc.type === "invoice" && <span className={`mt-0.5 inline-block text-xs font-semibold ${rowOwed > 0 ? "text-amber-700" : "text-emerald-700"}`}>{rowOwed > 0 ? `$${rowOwed.toFixed(2)} owed` : paid > 0 ? "Paid" : ""}</span>}
              </span>
              <span aria-hidden="true" className="shrink-0 text-xl text-slate-400">›</span>
            </a>
          ))}
        </div>
      </section>
      <LegalLinks className="mt-8 text-center" />
    </main>
  );
}
