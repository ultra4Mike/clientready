/**
 * R80: one status label for a document everywhere (invoice header, Documents column, dashboard).
 * It is the pipeline stage (lib/doc-stage), plus "Overdue" for an invoice past due (R86 rule).
 */
import { docAmounts, documentStage, STAGE_LABEL } from "@/lib/doc-stage";
import { invoicePastDue, readPayments, refundState } from "@/lib/payments";

type Doc = Parameters<typeof documentStage>[0];

export function displayStatus(doc: Doc, allDocs: Doc[] = [], today?: string) {
  const { stage } = documentStage(doc, allDocs);
  const { total, owed } = docAmounts(doc);
  // R126: a paid invoice later refunded reads Refunded / Partially refunded (no silent owed balance) unless re-billed.
  const data = (doc.data || {}) as Record<string, unknown>;
  const refund = doc.type === "invoice" && !data.rebillRefund && !["void", "voided"].includes(String(data.status || "")) ? refundState(total, readPayments(data)) : "";
  if (refund) return { key: refund, label: refund === "refunded" ? "Refunded" : "Partially refunded" };
  if (doc.type === "invoice" && stage !== "paid" && stage !== "draft" && invoicePastDue(doc.data as Record<string, unknown>, total, owed, today)) return { key: "overdue", label: "Overdue" };
  // R80: an invoice with some money in but not all reads "Partially paid".
  if (doc.type === "invoice" && stage !== "paid" && stage !== "draft" && owed > 0.004 && total - owed > 0.004) return { key: "partial", label: "Partially paid" };
  return { key: stage, label: STAGE_LABEL[stage] };
}
