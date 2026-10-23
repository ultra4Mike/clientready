/**
 * Change order contract summary (display only). Uses docAmounts — the same money math as everywhere — and never
 * writes anything: payments, billedOutstanding and cashCollected stay exactly as recorded.
 */
import { isRevision, revisesOf } from "@/lib/change-order-revision";
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
  if (String(doc.data?.status || "draft") !== "draft" || paid !== 0) return false;
  // Option A: a revised-version draft is "empty" until something is added or the total changes.
  if (isRevision(doc as never)) {
    const items = (Array.isArray(doc.data?.items) ? doc.data.items : []) as { fromVersion?: unknown; rate?: unknown }[];
    return !items.some((item) => !item.fromVersion && Number(item.rate || 0) !== 0) && Math.abs(total - revisesOf(doc as never).total) < 0.005;
  }
  return total === 0;
}

export type ContractSummary = {
  original: Doc; originalNumber: string; originalTotal: number;
  changeOrders: { id: string; number: string; amount: number; status: string; empty: boolean; isVoid: boolean; counted: boolean }[];
  changeOrdersTotal: number; pendingTotal: number; revisedTotal: number; paidToDate: number; remaining: number;
};

/** The original + all its change orders. Only sent-or-later change orders count; drafts and void are listed, not counted. */
export function contractSummary(docs: Doc[], anyId: string): ContractSummary | null {
  const doc = docs.find((d) => d.id === anyId);
  if (!doc || doc.type !== "invoice") return null;
  const originalId = readChangeOrderOf(doc.data?.changeOrderOf)?.id || doc.id;
  const original = docs.find((d) => d.id === originalId);
  if (!original) return null;
  // Add-on change orders only; revised versions (Option A) have their own panel and replace, not add.
  const cos = docs.filter((d) => d.type === "invoice" && !isRevision(d as never) && readChangeOrderOf(d.data?.changeOrderOf)?.id === original.id)
    .sort((a, b) => String(a.data?.invoiceDate || "").localeCompare(String(b.data?.invoiceDate || "")) || numberOf(a).localeCompare(numberOf(b), undefined, { numeric: true }));
  const o = docAmounts(original);
  const isCounted = (d: Doc) => !isVoid(d) && String(d.data?.status || "draft") !== "draft";
  const counted = [original, ...cos.filter(isCounted)].filter((d) => !isVoid(d));
  const changeOrders = cos.map((d) => ({ id: d.id, number: numberOf(d), amount: docAmounts(d).total, status: String(d.data?.status || "draft"), empty: isEmptyDraftChangeOrder(d), isVoid: isVoid(d), counted: isCounted(d) }));
  const changeOrdersTotal = cents(changeOrders.filter((c) => c.counted).reduce((s, c) => s + c.amount, 0));
  const pendingTotal = cents(changeOrders.filter((c) => !c.counted && !c.isVoid).reduce((s, c) => s + c.amount, 0));
  return {
    original, originalNumber: numberOf(original), originalTotal: o.total, changeOrders, changeOrdersTotal, pendingTotal,
    revisedTotal: cents((isVoid(original) ? 0 : o.total) + changeOrdersTotal),
    paidToDate: cents(counted.reduce((s, d) => s + docAmounts(d).paid, 0)),
    remaining: cents(counted.reduce((s, d) => s + docAmounts(d).owed, 0)),
  };
}
