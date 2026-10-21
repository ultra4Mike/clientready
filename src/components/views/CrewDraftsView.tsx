"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";
import { crewKindLabel, readCostLines } from "@/lib/cost-categories";

type Draft = {
  id: string;
  worker_name: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  work_done: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hours: string;
  parts_cost: string;
  parts_note: string;
  costs?: unknown;
  opened_doc_id?: string;
  drive_hours: string;
  drive_minutes: string;
  notes: string;
  finished: boolean;
  collected_amount: string;
  collected_method: string;
  status: string;
  created_at?: string;
};

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: rows } = await supabase.from("job_drafts").select("*").eq("owner_id", data.user.id).order("created_at", { ascending: false });
      setDrafts((rows || []) as Draft[]);
    }
    load();
  }, []);

  /** R18: the invoice this report already became (cloud link, or a saved invoice on this device that carries it). */
  function existingInvoice(draft: Draft) {
    let docs: { id: string; title?: string; data?: { invoiceNumber?: string; crewReport?: { draftId?: string } } }[] = [];
    try { docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"); } catch { docs = []; }
    const doc = docs.find((item) => (draft.opened_doc_id && item.id === draft.opened_doc_id) || item.data?.crewReport?.draftId === draft.id);
    if (doc) return { id: doc.id, label: doc.data?.invoiceNumber || doc.title || "the invoice" };
    return draft.opened_doc_id ? { id: "", label: "" } : null;
  }

  function openAsInvoice(draft: Draft) {
    // R82: never a second invoice from the same report.
    const existing = existingInvoice(draft);
    if (existing?.id) { window.location.href = `/invoice?id=${encodeURIComponent(existing.id)}`; return; }
    // Receipts stay on the report (too big to hand over); the invoice only notes that one exists.
    const lines = readCostLines(draft).map(({ receipt, ...line }) => ({ ...line, ...(receipt ? { receipt: "1" } : {}) }));
    window.localStorage.setItem("clientready-open-draft", JSON.stringify({ ...draft, costs: lines }));
    window.location.href = "/invoice";
  }

  return (
    <AppShell title="Crew drafts">
      <PageHeader title="Crew drafts" subtitle="Jobs the crew sent in. Open one, set the price, and save the invoice." />
      <div className="space-y-3">
        {drafts.length === 0 && <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-xl">🧰</span><p className="text-base font-semibold">No crew jobs yet.</p><p className="max-w-sm text-sm text-[var(--cr-muted)]">When your crew sends a job report from their phone, it shows up here ready to price.</p></div>}
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
            <p className="text-base font-semibold">{draft.client_name} · {draft.worker_name}</p>
            <p className="text-sm text-[var(--cr-muted)]">
              {draft.work_date || (draft.created_at ? `Sent ${String(draft.created_at).slice(0, 10)}` : "No date")} · {draft.hours || "0"} hrs · {draft.status}
              {draft.finished ? " · finished" : ""}
            </p>
            <p className="mt-3 text-sm leading-6">{draft.work_done}</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">
              Costs ${readCostLines(draft).reduce((sum, line) => sum + Number(line.amount), 0).toFixed(2)} · Collected ${draft.collected_amount || "0"} {draft.collected_method || ""}
            </p>
            {readCostLines(draft).length > 0 && (
              <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 text-sm dark:divide-teal-500/20 dark:border-teal-500/25" data-testid="draft-costs">
                {readCostLines(draft).map((line, index) => (
                  <li key={index} data-testid="draft-cost" data-kind={line.kind} data-amount={line.amount} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="min-w-0 flex-1"><span className="font-medium">{crewKindLabel(line.kind)}</span>{line.note ? <span className="text-[var(--cr-muted)]"> · {line.note}</span> : null}</span>
                    <span className="tabular-nums font-medium">${line.amount}</span>
                    {line.receipt && <a href={line.receipt} download={`receipt-${draft.id}-${index + 1}.jpg`} className="inline-flex min-h-11 items-center text-xs font-medium text-teal-700 underline dark:text-teal-300" data-testid="draft-cost-receipt">Save receipt</a>}
                  </li>
                ))}
              </ul>
            )}
            {(() => {
              const existing = typeof window === "undefined" ? null : existingInvoice(draft);
              if (!existing) return null;
              return (
                <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm" data-testid="draft-opened" data-doc-id={existing.id}>
                  <p>{existing.id ? <>Already opened as {existing.label}. Opening it again would count these costs twice.</> : <>Already turned into an invoice (not on this device yet). Creating another would count these costs twice.</>}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {existing.id && <a href={`/invoice?id=${encodeURIComponent(existing.id)}`} data-testid="draft-open-existing" className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950!">Open {existing.label}</a>}
                    <button type="button" data-testid="draft-create-another" className="min-h-11 rounded-lg border border-amber-500/60 px-4 font-medium" onClick={() => openAsInvoice(draft)}>Create another anyway</button>
                  </div>
                </div>
              );
            })()}
            {!(typeof window !== "undefined" && existingInvoice(draft)) && <button type="button" data-testid="draft-open" onClick={() => openAsInvoice(draft)} className="mt-4 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:w-auto">Open as invoice</button>}
          </div>
        ))}
      </div>
    </AppShell>
  );
}