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
 * Proposal payments the invoice doesn't have yet. Matched by id first. QA2 (R21): the fallback for older
 * copies / a server convert that gave new ids is stricter than amount + day: a candidate must also agree on
 * the reference (Stripe pi_/cs_ id, check number...) and the method whenever both sides have one, so a
 * different real payment of the same amount on the same day can no longer hide a deposit. Counted one-for-one.
 */
export function missingDeposits(proposalPayments: Payment[], invoicePayments: Payment[]) {
  const ids = new Set(invoicePayments.map((payment) => payment.id).filter(Boolean));
  const proposalIds = new Set(proposalPayments.map((p) => p.id));
  const cents = (payment: Payment) => Math.round((Number(payment.amount) || 0) * 100);
  const day = (payment: Payment) => String(payment.date || "").slice(0, 10);
  const norm = (v: unknown) => String(v || "").trim().toLowerCase();
  const agree = (a: unknown, b: unknown) => !norm(a) || !norm(b) || norm(a) === norm(b);
  const pool = invoicePayments.filter((payment) => !proposalIds.has(payment.id));
  const used = new Set<number>();
  const matches = (dep: Payment, inv: Payment) => cents(dep) === cents(inv) && day(dep) === day(inv) && agree(dep.ref, inv.ref) && agree(dep.method, inv.method);
  return proposalPayments.filter((payment) => {
    if ((Number(payment.amount) || 0) <= 0 || ids.has(payment.id)) return false;
    // Prefer an exact reference match, then any compatible one.
    let at = pool.findIndex((inv, i) => !used.has(i) && matches(payment, inv) && norm(payment.ref) && norm(payment.ref) === norm(inv.ref));
    if (at < 0) at = pool.findIndex((inv, i) => !used.has(i) && matches(payment, inv));
    if (at >= 0) { used.add(at); return false; }
    return true;
  });
}
