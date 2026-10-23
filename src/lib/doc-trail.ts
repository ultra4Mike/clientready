/**
 * Document trail: one job's documents in order — recurring parent, original proposal, the invoice made
 * from it, every change order (oldest → newest), then recurring copies. Links only; nothing is merged and a
 * change order never replaces the original. Built on jobChain (fromProposal / changeOrderOf).
 */
import { jobChain } from "@/lib/job-chain";
import { readChangeOrderOf } from "@/lib/change-orders";
import { readRecurringFrom } from "@/lib/recurring";

type Doc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type TrailRole = "recurring-parent" | "proposal" | "invoice" | "change-order" | "recurring-copy";
export type TrailItem<T extends Doc = Doc> = { doc: T; role: TrailRole; label: string; number: string; latest: boolean };

const numberOf = (d: Doc) => String(d.data?.invoiceNumber || d.title || "");
const dateOf = (d: Doc) => String(d.data?.invoiceDate || "");
const byDate = (a: Doc, b: Doc) => dateOf(a).localeCompare(dateOf(b)) || numberOf(a).localeCompare(numberOf(b), undefined, { numeric: true });

export function docTrail<T extends Doc>(allDocs: T[], id: string): TrailItem<T>[] {
  const chain = jobChain(allDocs, id);
  if (!chain) return [];
  const docs = [...new Map(allDocs.map((d) => [d.id, d])).values()];
  const byId = new Map(docs.map((d) => [d.id, d]));
  const out: TrailItem<T>[] = [];
  const add = (doc: T | null | undefined, role: TrailRole) => {
    if (!doc || out.some((i) => i.doc.id === doc.id)) return;
    const number = numberOf(doc);
    const kind = role === "proposal" || (role === "recurring-parent" && doc.type === "proposal") ? "Proposal" : role === "change-order" ? "Change order" : "Invoice";
    out.push({ doc, role, number, label: `${kind} ${number}`.trim(), latest: false });
  };
  const parent = chain.invoice ? byId.get(readRecurringFrom(chain.invoice.data?.recurringFrom)?.id || "") : undefined;
  add(parent, "recurring-parent");
  add(chain.quote, "proposal");
  add(chain.invoice, "invoice");
  [...chain.changeOrders].sort(byDate).forEach((co) => add(co, "change-order"));
  const main = out.filter((i) => i.role !== "recurring-parent");
  if (main.length) main[main.length - 1].latest = true;
  if (chain.invoice) docs.filter((d) => d.type === "invoice" && readRecurringFrom(d.data?.recurringFrom)?.id === chain.invoice!.id).sort(byDate).forEach((c) => add(c, "recurring-copy"));
  return out;
}

/** Portal copies hide link ids: rebuild changeOrderOf.id from the original's number among the client's own docs. */
export function linkByNumber<T extends Doc>(docs: T[]): T[] {
  const idByNumber = new Map(docs.filter((d) => d.type === "invoice").map((d) => [numberOf(d), d.id]));
  return docs.map((d) => {
    const of = d.data?.changeOrderOf as { id?: string; number?: string } | undefined;
    if (!of || readChangeOrderOf(of) || !of.number || !idByNumber.get(String(of.number))) return d;
    return { ...d, data: { ...d.data, changeOrderOf: { id: idByNumber.get(String(of.number)), number: of.number } } };
  });
}
