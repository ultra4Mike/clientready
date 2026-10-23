"use client";

import { useEffect, useRef } from "react";
import { docAmounts } from "@/lib/doc-stage";
import { displayStatus } from "@/lib/doc-status";
import { docTrail } from "@/lib/doc-trail";
import { isEmptyDraftChangeOrder } from "@/lib/change-order-summary";
import { docHref } from "@/lib/job-chain";

type Doc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

/** Document trail: a compact horizontal strip of every document in this job's chain (scrolls on phones). */
export default function DocTrail({ docs, currentId, hrefFor = docHref, light = false }: { docs: Doc[]; currentId: string; hrefFor?: (doc: Doc) => string; light?: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  const trail = currentId ? docTrail(docs, currentId) : [];
  const show = trail.length >= 2;
  useEffect(() => {
    // Phones: bring the current chip into view inside the strip (never scrolls the page).
    const ol = list.current; const cur = ol?.querySelector<HTMLElement>("[data-current]");
    if (ol && cur && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = Math.max(0, cur.offsetLeft - ol.offsetLeft - 16);
  }, [show, currentId, trail.length]);
  if (!show) return null;
  const cos = trail.filter((i) => i.role === "change-order");
  const original = trail.find((i) => i.role === "invoice");
  return (
    <nav aria-label="Document trail" data-testid="doc-trail" className="print-hide mb-4">
      <ol ref={list} className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {trail.map((item, index) => {
          const current = item.doc.id === currentId;
          const { total } = docAmounts(item.doc);
          const status = isEmptyDraftChangeOrder(item.doc) ? "Empty draft" : displayStatus(item.doc as never, docs as never).label;
          const note = item.role === "change-order" && original ? `Change order to ${original.number}` : item.role === "invoice" && cos.length ? `Change orders: ${cos.map((c) => c.number).join(", ")}` : item.role === "recurring-parent" ? "Recurring from" : item.role === "recurring-copy" ? "Recurring copy" : "";
          return (
            <li key={item.doc.id} className="flex shrink-0 snap-start items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="opacity-50">›</span>}
              <a href={hrefFor(item.doc)} data-testid={`doc-trail-item-${item.doc.id}`} data-role={item.role} aria-current={current ? "page" : undefined} {...(current ? { "data-current": "true" } : {})}
                className={`block min-w-[10rem] max-w-[16rem] rounded-xl border px-3 py-2 text-xs leading-snug transition ${current ? "border-teal-500 bg-teal-500/15 ring-2 ring-teal-500/40" : light ? "border-slate-200 bg-white hover:bg-slate-50" : "border-teal-500/20 bg-[var(--cr-card)] hover:bg-teal-500/5"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{item.label}</span>
                  {item.latest && <span data-testid="doc-trail-latest" className="shrink-0 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Latest</span>}
                </span>
                <span className="block truncate opacity-80">{status} · ${total.toFixed(2)}{item.doc.data?.invoiceDate ? ` · ${String(item.doc.data.invoiceDate)}` : ""}</span>
                {note && <span className="block truncate opacity-70">{note}</span>}
                {current && <span data-testid="doc-trail-current" className="sr-only">Current document</span>}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
