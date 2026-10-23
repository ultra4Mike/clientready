"use client";

import { contractSummary } from "@/lib/change-order-summary";
import { displayStatus } from "@/lib/doc-status";
import { readSchedule, readWorkers } from "@/lib/schedule";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };
const $ = (n: number) => `$${n.toFixed(2)}`;

/** Change order money at a glance (display only). On a change order: the original contract; on the original: its change orders. */
export default function ChangeOrderPanel({ docs, currentId, onDeleteDraft }: { docs: Doc[]; currentId: string; onDeleteDraft?: () => void }) {
  const sum = currentId ? contractSummary(docs, currentId) : null;
  if (!sum || !sum.changeOrders.length) return null;
  const isCo = sum.original.id !== currentId;
  const row = (label: string, value: string, testid: string, strong = false) => (
    <div className="flex justify-between gap-3"><dt className="opacity-75">{label}</dt><dd data-testid={testid} className={strong ? "font-bold" : "font-semibold"}>{value}</dd></div>
  );
  if (isCo) {
    const co = sum.changeOrders.find((c) => c.id === currentId)!;
    const o = sum.original.data || {};
    const s = readSchedule(o);
    const names = new Map(readWorkers().map((w) => [w.id, w.name]));
    const crew = [...new Set([...((s?.workerIds || []).map((id) => names.get(id) || "")), ...((Array.isArray(o.crew) ? o.crew : []) as { name?: string }[]).map((r) => r.name || "")].filter(Boolean))];
    return (
      <section data-testid="co-original-contract" className="print-hide mb-4 rounded-2xl border border-amber-400/40 bg-amber-500/5 p-4 text-sm">
        {co.empty && (
          <div data-testid="co-empty-draft" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/60 bg-amber-100/60 px-3 py-2 font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
            <span>Empty draft, add the change: type what changed and its amount in Line items.</span>
            {onDeleteDraft && <button type="button" data-testid="co-delete-draft" className="cr-btn cr-btn-secondary" onClick={onDeleteDraft}>Delete draft</button>}
          </div>
        )}
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Original contract</p>
        <p className="mt-1">Change order to <a className="font-semibold underline" href={`/invoice?id=${encodeURIComponent(sum.original.id)}`} data-testid="co-original-number">{sum.originalNumber}</a>
          {" · "}{String(o.clientName || sum.original.clientName || "")}{o.clientAddress ? ` · ${String(o.clientAddress)}` : ""}</p>
        {(s?.date || crew.length > 0) && <p className="mt-0.5 opacity-80" data-testid="co-job">{s?.date ? `Job ${s.date}` : ""}{s?.date && crew.length ? " · " : ""}{crew.length ? `Crew: ${crew.join(", ")}` : ""}</p>}
        <dl className="mt-3 grid gap-1 sm:max-w-md">
          {row("Original total", $(sum.originalTotal), "co-original-total")}
          {row("Paid to date", $(sum.paidToDate), "co-paid-to-date")}
          {row("This change order", $(co.amount), "co-this-amount")}
          {sum.changeOrders.length > 1 && row("All change orders", $(sum.changeOrdersTotal), "co-all-amount")}
          {row("New contract total", $(sum.revisedTotal), "co-new-total", true)}
          {row("Remaining balance", $(sum.remaining), "co-remaining", true)}
        </dl>
      </section>
    );
  }
  return (
    <section data-testid="co-summary" className="print-hide mb-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">Change orders</p>
      <ul className="mt-2 divide-y divide-teal-500/10">
        {sum.changeOrders.map((c) => {
          const d = docs.find((x) => x.id === c.id)!;
          return (
            <li key={c.id} data-testid={`co-summary-item-${c.id}`} className="flex flex-wrap justify-between gap-2 py-1.5">
              <a href={`/invoice?id=${encodeURIComponent(c.id)}`} className="font-semibold underline">{c.number}</a>
              <span>{c.empty ? <span className="font-semibold text-amber-700 dark:text-amber-300">Empty draft, add the change</span> : displayStatus(d as never, docs as never).label} · {$(c.amount)}{c.isVoid ? " (not counted)" : ""}</span>
            </li>
          );
        })}
      </ul>
      <dl className="mt-3 grid gap-1 border-t border-teal-500/20 pt-2 sm:max-w-md">
        {row("Original total", $(sum.originalTotal), "co-original-total")}
        {row("Change orders", $(sum.changeOrdersTotal), "co-all-amount")}
        {row("Revised total", $(sum.revisedTotal), "co-revised-total", true)}
        {row("Paid to date", $(sum.paidToDate), "co-paid-to-date")}
        {row("Remaining balance", $(sum.remaining), "co-remaining", true)}
      </dl>
    </section>
  );
}
