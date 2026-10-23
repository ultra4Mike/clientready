"use client";

import { isRevision, replacedBy, revisesOf } from "@/lib/change-order-revision";
import { docAmounts } from "@/lib/doc-stage";

type Doc = { id: string; type: string; title: string; data?: Record<string, unknown> };
const $ = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const numberOf = (d: Doc) => String(d.data?.invoiceNumber || d.title || "");

/**
 * Option A change orders (display only). On a replaced version: "Replaced by INV-x, no longer valid" + forward link.
 * On a revised version: Was → Now, paid credits from earlier versions, Balance due. Payments are never moved or copied.
 */
export default function RevisionPanel({ docs, currentId, liveTotal, balance, credits, status, empty, onDeleteDraft }: {
  docs: Doc[]; currentId: string; liveTotal: number; balance: number; credits: { id: string; number: string; paid: number }[];
  status: string; empty?: boolean; onDeleteDraft?: () => void;
}) {
  const doc = docs.find((d) => d.id === currentId);
  if (!doc || doc.type !== "invoice") return null;
  const by = replacedBy(docs as never, doc as never) as Doc | null;
  if (by) {
    const paid = docAmounts(doc as never).paid;
    return (
      <section data-testid="co-replaced" className="print-hide mb-4 rounded-2xl border-2 border-slate-400/60 bg-slate-500/10 p-4 text-sm">
        <p className="text-base font-bold">Replaced by <a data-testid="co-replaced-link" className="underline" href={`/invoice?id=${encodeURIComponent(by.id)}`}>{numberOf(by)}</a>, no longer valid</p>
        <p className="mt-1 opacity-80">Your client sees {numberOf(by)} instead. This version is never overdue and can&apos;t be paid online.{paid > 0 ? ` The ${$(paid)} paid here stays recorded here and is credited on ${numberOf(by)}.` : ""}</p>
      </section>
    );
  }
  if (!isRevision(doc as never)) return null;
  const was = revisesOf(doc as never);
  const diff = liveTotal - was.total;
  const draft = status === "draft";
  return (
    <section data-testid="co-revision" className="print-hide mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4 text-sm">
      {empty && (
        <div data-testid="co-empty-draft" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/60 bg-amber-100/60 px-3 py-2 font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          <span>Nothing changed yet: add the new work in Line items, or change an amount.</span>
          {onDeleteDraft && <button type="button" data-testid="co-delete-draft" className="cr-btn cr-btn-secondary" onClick={onDeleteDraft}>Delete draft</button>}
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Change order · updated version</p>
      <p className="mt-1">Updated version of <a className="font-semibold underline" data-testid="co-revises" href={`/invoice?id=${encodeURIComponent(was.id)}`}>{was.number}</a></p>
      <p data-testid="co-was-now" className="mt-2 text-base font-semibold tabular-nums">Was {$(was.total)} → Now {$(liveTotal)} ({diff < 0 ? "−" : "+"}{$(diff)})</p>
      <dl className="mt-2 grid gap-1 tabular-nums sm:max-w-md">
        {credits.map((c) => (
          <div key={c.id} className="flex justify-between gap-3" data-testid="co-credit"><dt className="opacity-75">Paid on {c.number}</dt><dd className="font-semibold">−{$(c.paid)}</dd></div>
        ))}
        <div className="flex justify-between gap-3 border-t border-amber-400/40 pt-1"><dt className="font-bold">Balance due</dt><dd data-testid="co-balance-due" className="font-bold">{$(Math.max(balance, 0))}</dd></div>
      </dl>
      <p data-testid="co-draft-note" className="mt-2 text-xs opacity-80">{draft ? `Draft: ${was.number} stays valid until you send this change order.` : `Sent: this replaces ${was.number}. Payments already made stay on ${was.number} and are credited here.`}</p>
    </section>
  );
}
