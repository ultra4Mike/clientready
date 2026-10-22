/**
 * R80: one status label for a document everywhere (invoice header, Documents column, dashboard).
 * It is the pipeline stage (lib/doc-stage), plus "Overdue" for an invoice past due (R86 rule).
 */
import { docAmounts, documentStage, STAGE_LABEL } from "@/lib/doc-stage";
import { invoicePastDue, readPayments, refundState, refundWording } from "@/lib/payments";

type Doc = Parameters<typeof documentStage>[0];

export function displayStatus(doc: Doc, allDocs: Doc[] = [], today?: string) {
  // Help retest: a voided document reads "Void" everywhere (never "Paid" just because nothing is owed).
  if (["void", "voided"].includes(String((doc.data as Record<string, unknown> | undefined)?.status || ""))) return { key: "void", label: "Void" };
  const { stage } = documentStage(doc, allDocs);
  const { total, owed } = docAmounts(doc);
  // R126: a paid invoice later refunded reads Refunded / Partially refunded (no silent owed balance) unless re-billed.
  const data = (doc.data || {}) as Record<string, unknown>;
  const refund = doc.type === "invoice" && !data.rebillRefund && !["void", "voided"].includes(String(data.status || "")) ? refundState(total, readPayments(data)) : "";
  const wording = doc.type === "invoice" && !["void", "voided"].includes(String(data.status || "")) ? refundWording(total, readPayments(data)) : "";
  if (refund) return { key: refund, label: wording || (refund === "refunded" ? "Refunded" : "Partially refunded") };
  // A refund before the invoice was paid in full (e.g. the deposit given back) shows next to the status.
  const note = wording ? ` · ${wording}` : "";
  if (doc.type === "invoice" && stage !== "paid" && stage !== "draft" && invoicePastDue(doc.data as Record<string, unknown>, total, owed, today)) return { key: "overdue", label: `Overdue${note}` };
  // R80: an invoice with some money in but not all reads "Partially paid".
  if (doc.type === "invoice" && stage !== "paid" && stage !== "draft" && owed > 0.004 && total - owed > 0.004) return { key: "partial", label: `Partially paid${note}` };
  return { key: stage, label: `${STAGE_LABEL[stage]}${note}` };
}
