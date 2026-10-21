"use client";

import { useState } from "react";
import { saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";
import { duplicateGroups, isSentDoc, nextFreeNumber } from "@/lib/doc-numbers";

type Doc = CloudDoc & { clientName?: string; createdAt?: string };

/** R101: owner tool. Lists numbers used twice; renumbers one copy only after the owner confirms. */
export default function DuplicateNumbers({ documents, onChanged }: { documents: Doc[]; onChanged: (docs: Doc[]) => void }) {
  const [message, setMessage] = useState("");
  const groups = duplicateGroups(documents);
  if (!groups.length && !message) return null;

  async function renumber(doc: Doc) {
    const to = nextFreeNumber(documents, doc.type, String(doc.data?.invoiceNumber || ""));
    const from = String(doc.data?.invoiceNumber || "");
    const warn = isSentDoc(doc) ? `\n\nThis one was already sent. The client will see ${to} from now on.` : "";
    if (!window.confirm(`Change ${from} (${doc.clientName || "no client"}) to ${to}?${warn}`)) return;
    const next: Doc = { ...doc, title: doc.title === from ? to : doc.title, data: { ...(doc.data || {}), invoiceNumber: to, renumberedFrom: from } };
    await saveCloudDocument(next);
    const list = documents.map((item) => (item.id === doc.id ? next : item));
    window.localStorage.setItem("clientready-documents", JSON.stringify(list));
    onChanged(list);
    setMessage(`${from} (${doc.clientName || "no client"}) is now ${to}.`);
  }

  return (
    <section className="cr-panel mb-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm sm:p-5" data-testid="dup-numbers">
      {groups.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Fix duplicate numbers: {groups.length} number{groups.length === 1 ? " is" : "s are"} used more than once</p>}
      {groups.map((group) => (
        <div key={`${group.type}-${group.number}`} className="cr-tone-warn mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900" data-testid="dup-group" data-number={group.number}>
          <p className="font-semibold tabular-nums">{group.number}</p>
          <ul className="mt-2 divide-y divide-amber-300/40">
            {group.docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1 basis-40">{doc.clientName || "No client"} · {String(doc.data?.status || "draft")}{doc.createdAt ? ` · ${doc.createdAt}` : ""}</span>
                <button type="button" data-testid="dup-renumber" data-doc-id={doc.id} onClick={() => renumber(doc)} className={`cr-dup-btn min-h-11 rounded-lg px-4 font-semibold transition max-sm:w-full ${doc.id === group.suggest.id ? "cr-dup-primary bg-teal-500 text-slate-950! shadow-sm hover:bg-teal-400" : "border border-slate-400/60 hover:border-teal-500"}`}>
                  Give it a new number{doc.id === group.suggest.id ? " (suggested)" : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {message && <p role="status" className="mt-3 rounded-lg border border-teal-500/30 px-3 py-2" data-testid="dup-message">{message}</p>}
    </section>
  );
}
