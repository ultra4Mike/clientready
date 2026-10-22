/**
 * R21: a proposal's deposit belongs to exactly one invoice — the first one made from the proposal.
 * Later invoices made from the same proposal start with no payments (no double counting), and a
 * deposit recorded on the proposal after the invoice was made is carried to that first invoice
 * while it is still unpaid. Payments are matched by id (copied payments keep their id).
 */
import type { Payment } from "./payments";

type Doc = { id: string; type?: string; data?: Record<string, unknown> };
const from = (doc: Doc) => (doc.data?.fromProposal || {}) as { id?: string; depositApplied?: boolean };

export function invoicesFromProposal(docs: Doc[], proposalId: string) {
  // Help live check: a void or deleted copy never carries the deposit (so it can't be counted twice).
  return docs.filter((doc) => doc.type === "invoice" && proposalId && from(doc).id === proposalId
    && !["void", "voided"].includes(String(doc.data?.status || "")) && !doc.data?.deleted);
}

/** The invoice that carries the deposit: the one marked depositApplied, else (older data) the first one made. */
export function depositInvoice(docs: Doc[], proposalId: string): Doc | null {
  const made = invoicesFromProposal(docs, proposalId);
  return made.find((doc) => from(doc).depositApplied) || made[0] || null;
}

/**
 * Proposal payments the invoice doesn't have yet. Matched by id first; then (older copies, or a server
 * convert that gave new ids) by amount + calendar day, counted one-for-one so a deposit already on the
 * invoice with another id / a full timestamp is never added again, while two real $100 payments stay two.
 */
export function missingDeposits(proposalPayments: Payment[], invoicePayments: Payment[]) {
  const ids = new Set(invoicePayments.map((payment) => payment.id).filter(Boolean));
  const key = (payment: Payment) => `${Math.round((Number(payment.amount) || 0) * 100)}|${String(payment.date || "").slice(0, 10)}`;
  const left = new Map<string, number>();
  const proposalIds = new Set(proposalPayments.map((p) => p.id));
  for (const payment of invoicePayments) if (!proposalIds.has(payment.id)) left.set(key(payment), (left.get(key(payment)) || 0) + 1);
  return proposalPayments.filter((payment) => {
    if ((Number(payment.amount) || 0) <= 0 || ids.has(payment.id)) return false;
    const n = left.get(key(payment)) || 0;
    if (n > 0) { left.set(key(payment), n - 1); return false; }
    return true;
  });
}
