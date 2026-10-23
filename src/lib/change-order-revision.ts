/**
 * Revised-version change orders (Option A, approved by the owner).
 *
 * A "revision" change order (data.coMode === "revision") is a full new version of the job's invoice:
 * it copies every line of the latest version and adds the change. Once it is SENT (any status past
 * draft, not void) the version it revises is "replaced": no longer owed, never overdue, no pay button.
 * The replaced document's payments stay on it (never moved or copied) and still count as cash collected.
 * The revision owes: its total minus everything paid across the chain (original + revisions), refund-aware.
 *
 * Replacement is derived from the documents, not stored, so voiding (or un-sending) a revision makes the
 * version it replaced active again. Add-on change orders (older ones, no coMode) keep the old behavior.
 */
import { docAmounts } from "@/lib/doc-stage";
import { owedAfterRefunds, paidTotal, readPayments, type Payment } from "@/lib/payments";

type Doc = { id?: string; type?: string; title?: string; data?: Record<string, unknown> | null };
const dataOf = (doc?: Doc | null) => (doc?.data || {}) as Record<string, unknown>;
const statusOf = (doc?: Doc | null) => String(dataOf(doc).status || "draft");
const numberOf = (doc?: Doc | null) => String(dataOf(doc).invoiceNumber || doc?.title || "");

export function isVoidish(doc?: Doc | null) {
  const data = dataOf(doc);
  return ["void", "voided", "deleted"].includes(statusOf(doc)) || Boolean(data.deleted);
}
export function isRevision(doc?: Doc | null) {
  return doc?.type === "invoice" && dataOf(doc).coMode === "revision";
}
/** A revision counts (replaces what it revises) once it is sent: not draft, not void. */
export function revisionLive(doc?: Doc | null) {
  return isRevision(doc) && statusOf(doc) !== "draft" && !isVoidish(doc);
}
export function revisesOf(doc?: Doc | null) {
  const raw = (dataOf(doc).revises || {}) as { id?: unknown; number?: unknown; total?: unknown };
  return { id: String(raw.id || ""), number: String(raw.number || ""), total: Number(raw.total) || 0 };
}
export function rootIdOf(doc?: Doc | null) {
  const of = (dataOf(doc).changeOrderOf || {}) as { id?: unknown };
  return String(of.id || "") || String(doc?.id || "");
}

/**
 * The version a revision was made from: by revises.id, else by revises.number (a parent saved offline first
 * can get a new cloud id after the revision stored it; invoice numbers are unique per business).
 */
export function parentOf<T extends Doc>(docs: T[], rev?: Doc | null): T | null {
  if (!isRevision(rev)) return null;
  const { id, number } = revisesOf(rev);
  return docs.find((d) => d.id === id && d.id !== rev?.id) || (number ? docs.find((d) => d.id !== rev?.id && d.type === "invoice" && numberOf(d) === number) : undefined) || null;
}
const isParent = (docs: Doc[], rev: Doc, doc: Doc) => { const p = parentOf(docs, rev); return !!p && p.id === doc.id; };

/** The live revision that replaced this document, if any (newest by date, then number). */
export function replacedBy<T extends Doc>(docs: T[], doc?: Doc | null): T | null {
  if (!doc?.id) return null;
  const hits = docs.filter((d) => d.id !== doc.id && revisionLive(d) && isParent(docs, d, doc));
  if (!hits.length) return null;
  hits.sort((a, b) => String(dataOf(b).invoiceDate || "").localeCompare(String(dataOf(a).invoiceDate || "")) || numberOf(b).localeCompare(numberOf(a), undefined, { numeric: true }));
  return hits[0];
}

/**
 * The version chain of a document: itself plus its parents (revises -> parent -> ... -> original), void ones excluded.
 * Only the parent line counts, so two sibling change orders made from the same version never credit each other.
 */
export function revisionChain<T extends Doc>(docs: T[], doc?: Doc | null): T[] {
  if (!doc) return [];
  const ids: string[] = [String(doc.id || "")];
  for (let cur: Doc | undefined = doc, guard = 0; cur && isRevision(cur) && guard < 50; guard++) {
    const parent: Doc | null = parentOf(docs, cur);
    const prev = String(parent?.id || "");
    if (!prev || ids.includes(prev)) break;
    ids.push(prev);
    cur = parent || undefined;
  }
  const out: T[] = [];
  for (const id of ids) {
    const d = docs.find((x) => x.id === id);
    if (d && !isVoidish(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

/** Payments of a document, with a legacy "marked paid" (no rows) counted as its total. */
function paymentsCounting(doc: Doc): Payment[] {
  const rows = readPayments(dataOf(doc) as never);
  if (!rows.length && statusOf(doc) === "paid") return [{ id: "marked", amount: String(docAmounts(doc as never).total), method: "", date: "", ref: "" } as Payment];
  return rows;
}

/**
 * Single source of truth for "what was paid on this version" (credits, the replaced banner and revisionOwed):
 * net of refunds; a legacy "marked paid" with no payment rows counts as its total (marked: true).
 */
export function versionPaid(doc: Doc) {
  const rows = paymentsCounting(doc);
  const marked = rows.length === 1 && rows[0].id === "marked";
  return { paid: paidTotal(rows), marked };
}

/** What was paid on each earlier version of the chain ("Paid on INV-x: −$X" / "Marked paid on INV-x: −$X"). */
export function chainCredits(docs: Doc[], doc: Doc) {
  return revisionChain(docs, doc)
    .filter((d) => d.id !== doc.id)
    .map((d) => ({ id: String(d.id), number: numberOf(d), ...versionPaid(d) }))
    .filter((c) => c.paid > 0.004)
    .reverse();
}
export const creditLabel = (c: { number: string; marked?: boolean }) => `${c.marked ? "Marked paid" : "Paid"} on ${c.number}`;

/** A non-void revision (draft or sent) made from this exact version, newest first. */
export function childRevision<T extends Doc>(docs: T[], doc?: Doc | null): T | null {
  if (!doc?.id) return null;
  const hits = docs.filter((d) => d.id !== doc.id && isRevision(d) && !isVoidish(d) && isParent(docs, d, doc));
  hits.sort((a, b) => String(dataOf(b).invoiceDate || "").localeCompare(String(dataOf(a).invoiceDate || "")) || numberOf(b).localeCompare(numberOf(a), undefined, { numeric: true }));
  return hits[0] || null;
}
/** The newest version below this one (following non-void child revisions); itself if it has none. */
export function newestDescendant<T extends Doc>(docs: T[], doc: T): T {
  let cur = doc;
  for (let guard = 0; guard < 50; guard++) { const next = childRevision(docs, cur); if (!next) break; cur = next; }
  return cur;
}

/** Owed on a revision: its total minus all payments across the chain (refund-aware). */
export function revisionOwed(docs: Doc[], doc: Doc) {
  const own = docAmounts(doc as never);
  if (!isRevision(doc)) return own.owed;
  const others = revisionChain(docs, doc).filter((d) => d.id !== doc.id);
  // Same rows as versionPaid/chainCredits (paymentsCounting), so the credits always explain the Balance due.
  const payments = [...readPayments(dataOf(doc) as never), ...others.flatMap(paymentsCounting)];
  return owedAfterRefunds(own.total, payments, dataOf(doc).status, dataOf(doc).rebillRefund);
}

/**
 * The money view billedOutstanding and every overdue check use:
 * replaced → skip (owes nothing, never overdue); revision → chain owed; otherwise the doc's own owed.
 */
export function effectiveAmounts(docs: Doc[], doc: Doc) {
  const own = docAmounts(doc as never);
  if (doc.type === "invoice" && replacedBy(docs, doc)) return { total: own.total, owed: 0, replaced: true };
  return { total: own.total, owed: isRevision(doc) ? revisionOwed(docs, doc) : own.owed, replaced: false };
}

/** Latest version of the chain to copy a new revision from: the newest live revision, else the original. */
export function latestVersion<T extends Doc>(docs: T[], anyDoc: Doc): T | null {
  const root = rootIdOf(anyDoc);
  let current = docs.find((d) => d.id === root) || null;
  for (let guard = 0; current && guard < 50; guard++) {
    const next = replacedBy(docs, current);
    if (!next) break;
    current = next as T;
  }
  return current;
}
