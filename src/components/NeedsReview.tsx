"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { confirmJobDone } from "@/lib/schedule";
import { markReviewed, reviewItems, type ExpenseRow, type ReviewItem, type ReviewKind } from "@/lib/review";

const LABEL: Record<ReviewKind, string> = {
  expense: "Crew expense", done: "Job done", balance: "Balance owed", approval: "Awaiting approval", recurring: "Recurring", change: "Change order", missing: "Missing details",
};

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };

/** Owner dashboard list. Workers never reach the dashboard (AppShell sends them to /crew). */
export default function NeedsReview({ documents, onDocuments, loading = false, onCount }: { documents: Doc[]; onDocuments: (docs: Doc[]) => void; loading?: boolean; onCount?: (count: number) => void }) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    supabase.from("crew_expenses").select("id, doc_id, worker_name, kind, amount, note, created_at").order("created_at", { ascending: false })
      .then(({ data }) => setExpenses((data || []) as ExpenseRow[]));
  }, []);

  const items = reviewItems(documents, expenses);
  const count = items.length;
  // Lets the dashboard know how many items still need review (only once data has loaded).
  useEffect(() => {
    if (!loading) onCount?.(count);
  }, [count, loading, onCount]);

  async function review(item: ReviewItem) {
    setBusy(`${item.docId}:${item.key}`);
    if (item.kind === "done") {
      // Confirming is the review for a crew-done job (sets schedule.confirmedAt; nothing else changes).
      await confirmJobDone(item.docId).catch(() => null);
      onDocuments(JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"));
    } else {
      onDocuments(await markReviewed(item));
    }
    setBusy("");
  }

  return (
    <section data-testid="needs-review" data-count={loading ? undefined : count} data-loading={loading ? "true" : undefined} className="mb-8 rounded-2xl data-[loading=true]:animate-pulse data-[loading=true]:opacity-70 border border-teal-500/20 bg-[var(--cr-card)] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Needs review</h2>
        <span data-testid="needs-review-count" className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-200">{loading ? "…" : items.length}</span>
      </div>
      {loading ? (
        <div className="space-y-2" aria-busy="true"><span className="sr-only">Loading…</span>{[0, 1].map((n) => <div key={n} className="h-12 animate-pulse rounded-xl bg-teal-500/10 motion-reduce:animate-none" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--cr-muted)]">Nothing waiting. You are all caught up.</p>
      ) : (
        <ul className="divide-y divide-teal-500/10">
          {items.map((item) => (
            <li key={`${item.docId}:${item.key}`} data-testid={`review-${item.kind}`} data-kind={item.kind} data-key={item.key} data-missing={item.kind === "missing" ? item.version : undefined} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-2.5">
              <a href={item.href} className="min-w-0 flex-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{LABEL[item.kind]}</span>
                <span className="block text-sm font-medium break-words sm:truncate">{item.title}</span>
                <span className="block text-xs text-[var(--cr-muted)] break-words sm:truncate">{item.detail}</span>
              </a>
              <button type="button" disabled={Boolean(busy)} onClick={() => review(item)} data-testid="mark-reviewed"
                className="tap min-h-11 shrink-0 self-start rounded-lg border border-teal-500/30 px-3 py-1.5 text-xs sm:min-h-0 sm:self-auto font-medium text-teal-700 transition hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-200">
                {busy === `${item.docId}:${item.key}` ? "Saving…" : item.kind === "done" ? "Confirm done" : "Mark reviewed"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
