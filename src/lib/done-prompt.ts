/** QA3c: after the owner confirms a job done, the next money step: create, send or collect the invoice. */
import { docAmounts } from "./doc-stage";

type Doc = { id: string; type: string; data?: Record<string, unknown> };
export type DonePrompt = { text: string; label: string; href: string } | null;

export function donePrompt(doc: Doc | undefined, allDocs: Doc[] = []): DonePrompt {
  if (!doc) return null;
  const open = `/invoice?id=${encodeURIComponent(doc.id)}`;
  if (doc.type !== "invoice") {
    const inv = allDocs.find((d) => d.type === "invoice" && (d.data?.fromProposal as { id?: string } | undefined)?.id === doc.id);
    if (inv) return donePrompt(inv);
    return { text: "Job done. Next: create the invoice.", label: "Create invoice", href: open };
  }
  const status = String(doc.data?.status || "draft");
  if (["void", "voided", "deleted"].includes(status)) return null;
  let owed = 0;
  try { owed = docAmounts(doc as never).owed; } catch { owed = 0; }
  if (status === "paid" || (status !== "draft" && owed <= 0.004)) return null;
  if (status === "draft") return { text: "Job done. Next: send the invoice.", label: "Send invoice", href: open };
  return { text: `Job done. Next: collect the $${owed.toFixed(2)} owed.`, label: "Collect payment", href: "/collect" };
}

export function donePromptFor(docId: string): DonePrompt {
  if (typeof window === "undefined") return null;
  try {
    const docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as Doc[];
    return donePrompt(docs.find((d) => d.id === docId), docs);
  } catch { return null; }
}
