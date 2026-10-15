"use client";

import { useEffect, useState } from "react";
import { readSetupInput, setupChecklist, type SetupItem } from "@/lib/getting-started";

type Doc = { type: string; data?: Record<string, unknown> };

/** Plain getting-started list for the dashboard (the design bot styles it via the data hooks). */
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
    <section data-testid="getting-started" data-state={state} data-done={done} data-total={items?.length || 0} className="my-4 rounded-2xl border border-teal-500/20 p-4 text-sm">
      <p className="font-semibold">Getting started{items ? ` · ${done}/${items.length}` : ""}</p>
      {!items && <p className="text-[var(--cr-muted)]">Loading…</p>}
      {items && (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.key} data-testid="checklist-item" data-key={item.key} data-done={item.done}>
              <span aria-hidden>{item.done ? "✓" : "○"}</span>{" "}
              {item.done ? <span className="text-[var(--cr-muted)]">{item.label}</span> : <a href={item.href} className="underline">{item.label}</a>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
