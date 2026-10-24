/**
 * QA3: the ONE source for billed, job costs, collected income (net of sales tax), spent, profit and set-aside.
 * Overview, Income, Expenses, Taxes (quarters) and the Documents totals all read from here, with one date rule:
 * billed and job costs by invoice date, cash by payment date, business expenses by their own date.
 */
import { documentTotals, amountOf } from "./discount";
import { cashEntries, draftMoneyTaken } from "./money";
import { effectiveAmounts, isRevision, revisionLive } from "./change-order-revision";
import { dedupeCopies } from "./doc-dedupe";
import { isPendingRecurringDraft } from "./recurring";
import { jobProfit } from "./job-profit";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (value: unknown) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const inRange = (date: string, from = "", to = "") => Boolean(date) && (!from || date >= from) && (!to || date <= to);

export const isVoidOrDeleted = (doc: Doc) => ["void", "voided", "deleted"].includes(String(doc.data?.status || "")) || Boolean(doc.data?.deleted);

/** An invoice that counts as billed: sent (not draft), not void/deleted, not a pending recurring draft, not replaced by a revision. */
export function isBilledInvoice(doc: Doc, allDocs: Doc[]) {
  if (doc.type !== "invoice" || isVoidOrDeleted(doc) || isPendingRecurringDraft(doc as never)) return false;
  // A draft is not billed, unless money was already taken on it (it reads Paid everywhere else).
  if (String(doc.data?.status || "draft") === "draft" && !draftMoneyTaken(doc as never)) return false;
  // QA4: an unsent revision repeats the whole job; it is billed only once it replaces the version it revises.
  if (isRevision(doc as never) && !revisionLive(doc as never)) return false;
  return !effectiveAmounts(allDocs as never, doc as never).replaced;
}

/** QA3c: an invoice whose job counts for costs / Profit by job: any invoice (draft, unsent, sent or paid) not void, pending recurring or replaced. */
export function isCostedJob(doc: Doc, allDocs: Doc[]) {
  if (doc.type !== "invoice" || isVoidOrDeleted(doc) || isPendingRecurringDraft(doc as never)) return false;
  return !effectiveAmounts(allDocs as never, doc as never).replaced;
}

export const invoiceDay = (doc: Doc) => ymd(doc.data?.invoiceDate) || ymd(doc.createdAt);

export function taxParts(doc: Doc) {
  const data = doc.data || {};
  const items = Array.isArray(data.items) ? (data.items as { qty?: unknown; rate?: unknown }[]) : [];
  const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
  return documentTotals(subtotal, String(data.taxPercent ?? ""), String(data.discountType ?? ""), String(data.discountValue ?? ""));
}

/** Job costs of one invoice: the same number as Profit by job (owner costs + card fees + mileage). */
export const jobCostOf = (doc: Doc) => jobProfit({ total: taxParts(doc).total, data: doc.data || {} }).cost;

export function billedInvoices(allDocs: Doc[], from = "", to = "") {
  const docs = dedupeCopies(allDocs);
  return docs.filter((doc) => isBilledInvoice(doc, docs) && inRange(invoiceDay(doc), from, to));
}

export function billedTotal(allDocs: Doc[], from = "", to = "") {
  return r2(billedInvoices(allDocs, from, to).reduce((sum, doc) => sum + taxParts(doc).total, 0));
}

export function jobCostsTotal(allDocs: Doc[], from = "", to = "") {
  // QA3c: costs of every real job (draft / unsent / sent / paid), the same set as Profit by job.
  const docs = dedupeCopies(allDocs);
  return r2(docs.filter((doc) => isCostedJob(doc, docs) && inRange(invoiceDay(doc), from, to)).reduce((sum, doc) => sum + jobCostOf(doc), 0));
}

/** Cash in by payment date: gross (refunds negative), the sales-tax share of it, and income = gross − sales tax. */
export function cashIncome(allDocs: Doc[], from = "", to = "") {
  const docs = dedupeCopies(allDocs);
  const byId = new Map(docs.map((d) => [d.id, d]));
  let gross = 0, salesTax = 0, refunds = 0;
  for (const e of cashEntries(docs as never)) {
    if (!inRange(e.date, from, to)) continue;
    gross += e.amount;
    if (e.amount < 0) refunds += -e.amount;
    const doc = byId.get(e.docId);
    if (doc?.type === "invoice") {
      const t = taxParts(doc);
      if (t.total > 0 && t.tax > 0) salesTax += e.amount * (t.tax / t.total);
    }
  }
  return { gross: r2(gross), salesTax: r2(salesTax), refunds: r2(refunds), income: r2(gross - salesTax) };
}

/** Set-aside: one rule everywhere. */
export const setAsideOf = (profit: number, percent: number) => (profit > 0 ? r2(profit * ((Number(percent) || 0) / 100)) : 0);

type Biz = { date: string; amount: number };
/** One period's numbers: income (no sales tax) − (job costs + business expenses) = profit; set-aside from that profit. */
export function periodSummary(allDocs: Doc[], biz: Biz[], from: string, to: string, percent: number) {
  const cash = cashIncome(allDocs, from, to);
  const jobCosts = jobCostsTotal(allDocs, from, to);
  const business = r2(biz.filter((b) => inRange(ymd(b.date), from, to)).reduce((s, b) => s + (Number(b.amount) || 0), 0));
  const spent = r2(jobCosts + business);
  const profit = r2(cash.income - spent);
  return { collected: cash.income, salesTax: cash.salesTax, refunds: cash.refunds, jobCosts, business, spent, profit, setAside: setAsideOf(profit, percent) };
}
