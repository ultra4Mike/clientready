"use client";

import { useEffect, useState } from "react";
import Checklist from "@/components/Checklist";
import { readSetupInput, setupChecklist, type SetupItem } from "@/lib/getting-started";

type Doc = { type: string; data?: Record<string, unknown> };

/** Dashboard getting-started list (design bot's Checklist) with data hooks. */
export default function GettingStarted({ documents, loading }: { documents: Doc[]; loading?: boolean }) {
  const [items, setItems] = useState<SetupItem[] | null>(null);

  useEffect(() => {
    if (loading) return;
    let live = true;
    readSetupInput(documents).then((input) => live && setItems(setupChecklist(input)));
    return () => {
      live = false;
    };
  }, [documents, loading]);

  const done = items ? items.filter((item) => item.done).length : 0;
  const state = !items ? "loading" : done === items.length ? "complete" : "open";
  return (
    <div data-testid="getting-started" data-state={state} data-done={done} data-total={items?.length || 0} className="my-4">
      {!items && <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-teal-500/10" />}
      {items && state === "open" && (
        <Checklist
          items={items.map((item) => ({ label: item.label, done: item.done, href: item.href, attrs: { "data-testid": "checklist-item", "data-key": item.key, "data-done": String(item.done) } }))}
        />
      )}
      {items && state === "complete" && (
        <details className="group/gs rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-base">🎉</span>
            <span className="min-w-0 flex-1"><span className="font-semibold">You are all set up.</span> <span className="text-[var(--cr-muted)]">Every getting-started step is done.</span></span>
            <span aria-hidden="true" className="text-[var(--cr-muted)] transition group-open/gs:rotate-90">›</span>
          </summary>
          <div className="px-2 pb-2">
            <Checklist
              items={items.map((item) => ({ label: item.label, done: item.done, href: item.href, attrs: { "data-testid": "checklist-item", "data-key": item.key, "data-done": String(item.done) } }))}
            />
          </div>
        </details>
      )}
    </div>
  );
}
