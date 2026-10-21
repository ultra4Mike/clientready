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
    <section className="mb-4 rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4 text-sm" data-testid="dup-numbers">
      {groups.length > 0 && <p className="font-semibold">Fix duplicate numbers: {groups.length} number{groups.length === 1 ? " is" : "s are"} used more than once</p>}
      {groups.map((group) => (
        <div key={`${group.type}-${group.number}`} className="mt-2" data-testid="dup-group" data-number={group.number}>
          <p className="font-medium">{group.number}</p>
          <ul className="mt-1 space-y-1">
            {group.docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-2">
                <span>{doc.clientName || "No client"} · {String(doc.data?.status || "draft")}{doc.createdAt ? ` · ${doc.createdAt}` : ""}</span>
                <button type="button" data-testid="dup-renumber" data-doc-id={doc.id} onClick={() => renumber(doc)} className={`min-h-11 rounded-lg border px-3 font-medium ${doc.id === group.suggest.id ? "border-teal-500 text-teal-700 dark:text-teal-300" : "border-slate-300"}`}>
                  Give it a new number{doc.id === group.suggest.id ? " (suggested)" : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {message && <p role="status" className="mt-2" data-testid="dup-message">{message}</p>}
    </section>
  );
}
