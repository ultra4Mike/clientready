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
      {items && (
        <Checklist
          items={items.map((item) => ({ label: item.label, done: item.done, href: item.href, attrs: { "data-testid": "checklist-item", "data-key": item.key, "data-done": String(item.done) } }))}
        />
      )}
    </div>
  );
}
