/**
 * QA3: an invoice with payments or refunds is never hard-deleted. It is voided instead: the record and its
 * payment/refund rows stay (reports keep the cash with a "Void" status), it leaves billed/owed totals, and the
 * source proposal goes back to Approved so it is not orphaned as "Invoiced".
 */
import { readPayments } from "./payments";

type Doc = { id: string; type: string; data?: Record<string, unknown> | null };

/** Any non-zero payment or refund row (a voided payment row does not count). */
export function hasMoneyRecords(doc: Doc) {
  return doc.type === "invoice" && readPayments((doc.data || {}) as never).some((p) => !(p as { voided?: unknown }).voided && Math.abs(Number(String(p.amount ?? "").replace(/[^0-9.-]/g, "")) || 0) > 0.004);
}

const isVoid = (doc: Doc) => ["void", "voided", "deleted"].includes(String(doc.data?.status || "")) || Boolean(doc.data?.deleted);

/** The proposal this invoice came from, reset when no other live invoice still comes from it. */
export function resetSourceProposal(invoice: Doc, allDocs: Doc[], now = new Date().toISOString()): Doc | null {
  const fromId = (invoice.data?.fromProposal as { id?: string } | undefined)?.id;
  if (!fromId) return null;
  const proposal = allDocs.find((d) => d.id === fromId && d.type === "proposal");
  if (!proposal) return null;
  const others = allDocs.some((d) => d.id !== invoice.id && d.type === "invoice" && !isVoid(d) && (d.data?.fromProposal as { id?: string } | undefined)?.id === fromId);
  if (others) return null;
  const data = { ...(proposal.data || {}) } as Record<string, unknown>;
  const approved = (data.approval as { status?: string } | undefined)?.status === "approved";
  delete data.invoicedAs;
  data.status = approved || ["accepted", "approved", "invoiced"].includes(String(data.status || "")) ? "accepted" : String(data.status || "draft");
  data.history = [...(Array.isArray(data.history) ? data.history : []), { at: now, kind: "unlinked", text: `Invoice ${String(invoice.data?.invoiceNumber || "")} was ${hasMoneyRecords(invoice) ? "voided" : "deleted"}; proposal is open to invoice again.` }];
  return { ...proposal, data };
}

/** The voided copy: same id, payments and refunds kept, status "void" with a reason and time. */
export function voidInvoice(invoice: Doc, now = new Date().toISOString()): Doc {
  return { ...invoice, data: { ...(invoice.data || {}), status: "void", voidedAt: now, voidKeepsPayments: true, voidReason: "Voided instead of deleted (it has payments or refunds)" } };
}
