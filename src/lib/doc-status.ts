/**
 * R80: one status label for a document everywhere (invoice header, Documents column, dashboard).
 * It is the pipeline stage (lib/doc-stage), plus "Overdue" for an invoice past due (R86 rule).
 */
import { docAmounts, documentStage, STAGE_LABEL } from "@/lib/doc-stage";
import { invoicePastDue } from "@/lib/payments";

type Doc = Parameters<typeof documentStage>[0];

export function displayStatus(doc: Doc, allDocs: Doc[] = [], today?: string) {
  const { stage } = documentStage(doc, allDocs);
  const { total, owed } = docAmounts(doc);
  if (doc.type === "invoice" && stage !== "paid" && stage !== "draft" && invoicePastDue(doc.data as Record<string, unknown>, total, owed, today)) return { key: "overdue", label: "Overdue" };
  return { key: stage, label: STAGE_LABEL[stage] };
}
