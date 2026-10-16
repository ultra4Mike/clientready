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
  return docs.filter((doc) => doc.type === "invoice" && proposalId && from(doc).id === proposalId);
}

/** The invoice that carries the deposit: the one marked depositApplied, else (older data) the first one made. */
export function depositInvoice(docs: Doc[], proposalId: string): Doc | null {
  const made = invoicesFromProposal(docs, proposalId);
  return made.find((doc) => from(doc).depositApplied) || made[0] || null;
}

/** Proposal payments the invoice doesn't have yet (by id; same amount+date counts as the same payment for older copies). */
export function missingDeposits(proposalPayments: Payment[], invoicePayments: Payment[]) {
  const ids = new Set(invoicePayments.map((payment) => payment.id));
  const key = (payment: Payment) => `${Number(payment.amount) || 0}|${payment.date}`;
  const same = new Set(invoicePayments.map(key));
  return proposalPayments.filter((payment) => (Number(payment.amount) || 0) > 0 && !ids.has(payment.id) && !same.has(key(payment)));
}
