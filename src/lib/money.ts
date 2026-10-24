/**
 * R104: the ONE "money collected" calculation (cash basis): every non-voided payment, by the date it
 * was received. Refund rows count negative. Proposal deposits count once (not again when carried to
 * the invoice). Older invoices marked paid with no payment rows count their total on the paid date.
 * Dashboard, Documents and Reports all use this.
 */
import { docAmounts } from "./doc-stage";
import { readPayments, isRefundRow } from "./payments";
import { dedupeCopies } from "./doc-dedupe";
import { effectiveAmounts, isRevision, revisionLive } from "./change-order-revision";

type Doc = { id: string; type: string; title?: string; createdAt?: string; data?: Record<string, unknown> };
export type CashEntry = { docId: string; date: string; amount: number };

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const ymd = (value: unknown) => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return "";
  const d = new Date(parsed);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const voided = (doc: Doc) => ["void", "voided", "deleted"].includes(String(doc.data?.status || "")) || Boolean(doc.data?.deleted) || doc.data?.recurringReview === "pending";

export function cashEntries(allDocs: Doc[]): CashEntry[] {
  const docs = dedupeCopies(allDocs).filter((doc) => !voided(doc)); // R117: ids and device/cloud copies once
  const out: CashEntry[] = [];
  const invoiceKeys = new Map<string, Set<string>>(); // proposal id -> payment keys already on its invoices
  const carrierFirst = [...docs].sort((a, b) => Number(Boolean((b.data?.fromProposal as { depositApplied?: boolean } | undefined)?.depositApplied)) - Number(Boolean((a.data?.fromProposal as { depositApplied?: boolean } | undefined)?.depositApplied)));
  for (const doc of carrierFirst) {
    if (doc.type !== "invoice") continue;
    const data = doc.data || {};
    const from = (data.fromProposal as { id?: string } | undefined)?.id;
    const already = from ? invoiceKeys.get(from) : undefined;
    // R126: a deposit copied onto a second invoice from the same proposal counts once (on the first).
    const payments = readPayments(data).filter((p) => !(p as { voided?: unknown }).voided && (isRefundRow(p) ? num(p.amount) < 0 : num(p.amount) > 0) && !(already && (already.has(`id:${p.id}`) || already.has(`k:${num(p.amount)}|${p.date}`))));
    for (const p of payments) out.push({ docId: doc.id, date: ymd(p.date) || ymd(data.invoiceDate) || ymd(doc.createdAt), amount: num(p.amount) });
    if (!payments.length && data.status === "paid") out.push({ docId: doc.id, date: ymd(data.paymentDate) || ymd(data.invoiceDate) || ymd(doc.createdAt), amount: docAmounts(doc).total });
    if (from) {
      const keys = invoiceKeys.get(from) || new Set<string>();
      for (const p of payments) { keys.add(`id:${p.id}`); keys.add(`k:${num(p.amount)}|${p.date}`); }
      invoiceKeys.set(from, keys);
    }
  }
  for (const doc of docs) {
    if (doc.type !== "proposal") continue;
    const keys = invoiceKeys.get(doc.id) || new Set<string>();
    for (const p of readPayments(doc.data || {})) {
      if (!(num(p.amount) > 0) || (p as { voided?: unknown }).voided || keys.has(`id:${p.id}`) || keys.has(`k:${num(p.amount)}|${p.date}`)) continue;
      out.push({ docId: doc.id, date: ymd(p.date) || ymd(doc.data?.invoiceDate) || ymd(doc.createdAt), amount: num(p.amount) });
    }
  }
  return out;
}

/** Money collected, optionally between two YYYY-MM-DD dates (inclusive). */
export function cashCollected(docs: Doc[], from = "", to = "") {
  const total = cashEntries(docs).filter((e) => (!from || e.date >= from) && (!to || e.date <= to)).reduce((sum, e) => sum + e.amount, 0);
  return Math.round(total * 100) / 100;
}

/**
 * R126: the ONE billed / outstanding calculation. Each doc id once, invoices only, never drafts, voided
 * or pending recurring drafts. Outstanding is refund-aware (docAmounts). Optional invoice-date range.
 */
/**
 * QA3: was this invoice actually sent to the client? An invoice auto-made when the client approved the
 * proposal is "approved", not sent, until the owner emails/texts it (emailLog or sentAt).
 */
export function wasActuallySent(doc: Doc) {
  const data = doc.data || {};
  if (!data.autoConverted) return String(data.status || "draft") !== "draft";
  return (Array.isArray(data.emailLog) && data.emailLog.length > 0) || Boolean(data.sentAt);
}

/** A draft invoice paid directly (Mark paid, Stripe, a payment row) counts as billed everywhere. */
export function draftMoneyTaken(doc: Doc) {
  const data = doc.data || {};
  return data.status === "paid" || readPayments(data).some((p) => !(p as { voided?: unknown }).voided && !isRefundRow(p) && num(p.amount) > 0.004);
}

/** QA4: the invoices behind "Still owed" (same rules as billedOutstanding), for Collect: Collect open = Documents owed. */
export function openInvoiceIds(allDocs: Doc[]) {
  const out = new Map<string, number>();
  const docs = dedupeCopies(allDocs);
  for (const doc of docs) {
    if (doc.type !== "invoice" || voided(doc) || (String(doc.data?.status || "draft") === "draft" && !draftMoneyTaken(doc))) continue;
    if (isRevision(doc as never) && !revisionLive(doc as never)) continue;
    const { owed, replaced } = effectiveAmounts(docs as never, doc as never);
    if (!replaced && owed > 0.004) out.set(doc.id, Math.round(owed * 100) / 100);
  }
  return out;
}

/** QA4: the amount one invoice adds to Billed (same rule as billedOutstanding), or null when it is not billed. Docs must be deduped. */
export function billedAmount(doc: Doc, docs: Doc[]): number | null {
  if (doc.type !== "invoice" || voided(doc) || (String(doc.data?.status || "draft") === "draft" && !draftMoneyTaken(doc))) return null;
  if (isRevision(doc as never) && !revisionLive(doc as never)) return null;
  const { total, replaced } = effectiveAmounts(docs as never, doc as never);
  return replaced ? null : total;
}

export function billedOutstanding(allDocs: Doc[], from = "", to = "") {
  let sentCount = 0;
  let count = 0, billed = 0, outstanding = 0, owedCount = 0;
  const docs = dedupeCopies(allDocs);
  for (const doc of docs) {
    if (doc.type !== "invoice" || voided(doc) || (String(doc.data?.status || "draft") === "draft" && !draftMoneyTaken(doc))) continue;
    if (isRevision(doc as never) && !revisionLive(doc as never)) continue; // QA4: same rule as ledger isBilledInvoice
    const date = ymd(doc.data?.invoiceDate) || ymd(doc.createdAt);
    if ((from && date < from) || (to && date > to)) continue;
    // Option A (owner-approved): a version replaced by a SENT revision change order is not billed or owed
    // (its payments still count in cashCollected); a revision owes its total minus all chain payments.
    const { total, owed, replaced } = effectiveAmounts(docs as never, doc as never);
    if (replaced) continue;
    count += 1; billed += total; outstanding += owed;
    if (wasActuallySent(doc)) sentCount += 1;
    if (owed > 0.004) owedCount += 1; // QA2: the "N invoice(s)" next to Still owed comes from this same loop
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { count, sentCount, billed: r(billed), outstanding: r(outstanding), owedCount };
}
