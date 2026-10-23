/**
 * Change order contract summary (display only). Uses docAmounts — the same money math as everywhere — and never
 * writes anything: payments, billedOutstanding and cashCollected stay exactly as recorded.
 */
import { docAmounts } from "@/lib/doc-stage";
import { readChangeOrderOf } from "@/lib/change-orders";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };

const isVoid = (d: Doc) => /^void/.test(String(d.data?.status || ""));
const numberOf = (d: Doc) => String(d.data?.invoiceNumber || d.title || "");
const cents = (n: number) => Math.round(n * 100) / 100;

/** A change order nobody has filled in yet: still a Draft, $0 total, nothing paid. */
export function isEmptyDraftChangeOrder(doc: Doc) {
  if (!readChangeOrderOf(doc.data?.changeOrderOf) && !(doc.data?.changeOrderOf as { number?: string } | undefined)?.number) return false;
  const { total, paid } = docAmounts(doc);
  return String(doc.data?.status || "draft") === "draft" && total === 0 && paid === 0;
}

export type ContractSummary = {
  original: Doc; originalNumber: string; originalTotal: number;
  changeOrders: { id: string; number: string; amount: number; status: string; empty: boolean; isVoid: boolean }[];
  changeOrdersTotal: number; revisedTotal: number; paidToDate: number; remaining: number;
};

/** The original + all its change orders. Void ones are listed but not counted. */
export function contractSummary(docs: Doc[], anyId: string): ContractSummary | null {
  const doc = docs.find((d) => d.id === anyId);
  if (!doc || doc.type !== "invoice") return null;
  const originalId = readChangeOrderOf(doc.data?.changeOrderOf)?.id || doc.id;
  const original = docs.find((d) => d.id === originalId);
  if (!original) return null;
  const cos = docs.filter((d) => d.type === "invoice" && readChangeOrderOf(d.data?.changeOrderOf)?.id === original.id)
    .sort((a, b) => String(a.data?.invoiceDate || "").localeCompare(String(b.data?.invoiceDate || "")) || numberOf(a).localeCompare(numberOf(b), undefined, { numeric: true }));
  const o = docAmounts(original);
  const counted = [original, ...cos].filter((d) => !isVoid(d));
  const changeOrders = cos.map((d) => ({ id: d.id, number: numberOf(d), amount: docAmounts(d).total, status: String(d.data?.status || "draft"), empty: isEmptyDraftChangeOrder(d), isVoid: isVoid(d) }));
  const changeOrdersTotal = cents(changeOrders.filter((c) => !c.isVoid).reduce((s, c) => s + c.amount, 0));
  return {
    original, originalNumber: numberOf(original), originalTotal: o.total, changeOrders, changeOrdersTotal,
    revisedTotal: cents((isVoid(original) ? 0 : o.total) + changeOrdersTotal),
    paidToDate: cents(counted.reduce((s, d) => s + docAmounts(d).paid, 0)),
    remaining: cents(counted.reduce((s, d) => s + docAmounts(d).owed, 0)),
  };
}
