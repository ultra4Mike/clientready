import { readChangeOrderOf } from "@/lib/change-orders";
import { readSchedule, type Schedule } from "@/lib/schedule";

type Doc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type JobChain<T extends Doc = Doc> = { quote: T | null; invoice: T | null; changeOrders: T[]; scheduleDoc: T | null; schedule: Schedule | null };

const fromId = (doc: Doc) => (doc.data?.fromProposal as { id?: string } | undefined)?.id || "";

/**
 * Redesign 4: Request > Quote > Job > Invoice for one job, from any of its documents. Links only;
 * the schedule is read from ONE doc (the invoice when it has one, else the quote), never copied.
 */
export function jobChain<T extends Doc>(allDocs: T[], id: string): JobChain<T> | null {
  const docs = [...new Map(allDocs.map((d) => [d.id, d])).values()];
  const byId = new Map(docs.map((d) => [d.id, d]));
  let start = byId.get(id);
  if (!start) return null;
  const original = readChangeOrderOf(start.data?.changeOrderOf);
  if (start.type === "invoice" && original && byId.get(original.id)) start = byId.get(original.id)!;
  let quote: T | null = null, invoice: T | null = null;
  if (start.type === "proposal") {
    quote = start;
    invoice = docs.find((d) => d.type === "invoice" && fromId(d) === start!.id && !readChangeOrderOf(d.data?.changeOrderOf)) || null;
  } else if (start.type === "invoice") {
    invoice = start;
    quote = (fromId(start) && byId.get(fromId(start))) || null;
  }
  const changeOrders = invoice ? docs.filter((d) => d.type === "invoice" && readChangeOrderOf(d.data?.changeOrderOf)?.id === invoice!.id) : [];
  const scheduleDoc = invoice && readSchedule(invoice.data) ? invoice : quote && readSchedule(quote.data) ? quote : invoice || quote;
  return { quote, invoice, changeOrders, scheduleDoc, schedule: scheduleDoc ? readSchedule(scheduleDoc.data) : null };
}

export const docHref = (doc: Doc) => `/${doc.type === "proposal" ? "proposal" : "invoice"}?id=${encodeURIComponent(doc.id)}`;
