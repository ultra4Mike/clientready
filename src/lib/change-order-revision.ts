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
import { owedAfterRefunds, readPayments, type Payment } from "@/lib/payments";

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

/** The live revision that replaced this document, if any (newest by date, then number). */
export function replacedBy<T extends Doc>(docs: T[], doc?: Doc | null): T | null {
  if (!doc?.id) return null;
  const hits = docs.filter((d) => d.id !== doc.id && revisionLive(d) && revisesOf(d).id === doc.id);
  if (!hits.length) return null;
  hits.sort((a, b) => String(dataOf(b).invoiceDate || "").localeCompare(String(dataOf(a).invoiceDate || "")) || numberOf(b).localeCompare(numberOf(a), undefined, { numeric: true }));
  return hits[0];
}

/** Original + every revision of it (not add-on change orders), void ones excluded, each id once. */
export function revisionChain<T extends Doc>(docs: T[], doc?: Doc | null): T[] {
  if (!doc) return [];
  const root = rootIdOf(doc);
  // Also walk back through "revises" (the client portal only sees changeOrderOf.number, not its id).
  const back = new Set<string>([String(doc.id || "")]);
  for (let cur: Doc | undefined = doc, guard = 0; cur && isRevision(cur) && guard < 50; guard++) {
    const prev: string = revisesOf(cur).id;
    if (!prev || back.has(prev)) break;
    back.add(prev);
    cur = docs.find((d: Doc) => d.id === prev) as Doc | undefined;
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const d of docs) {
    if (!d.id || seen.has(d.id) || isVoidish(d)) continue;
    if (back.has(d.id) || d.id === root || (isRevision(d) && rootIdOf(d) === root)) { seen.add(d.id); out.push(d); }
  }
  return out;
}

/** Payments of a document, with a legacy "marked paid" (no rows) counted as its total. */
function paymentsCounting(doc: Doc): Payment[] {
  const rows = readPayments(dataOf(doc) as never);
  if (!rows.length && statusOf(doc) === "paid") return [{ id: "marked", amount: String(docAmounts(doc as never).total), method: "", date: "", ref: "" } as Payment];
  return rows;
}

/** What was paid on each earlier version of the chain (for the "Paid on INV-x: −$X" lines). */
export function chainCredits(docs: Doc[], doc: Doc) {
  return revisionChain(docs, doc)
    .filter((d) => d.id !== doc.id)
    .map((d) => ({ id: String(d.id), number: numberOf(d), paid: docAmounts(d as never).paid }))
    .filter((c) => c.paid > 0.004);
}

/** Owed on a revision: its total minus all payments across the chain (refund-aware). */
export function revisionOwed(docs: Doc[], doc: Doc) {
  const own = docAmounts(doc as never);
  if (!isRevision(doc)) return own.owed;
  const others = revisionChain(docs, doc).filter((d) => d.id !== doc.id);
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
