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
  // Help retest: a refunded-but-owing invoice uses the same word as the client page ("Due · Refunded $X"), not the pipeline stage.
  if (note && doc.type === "invoice" && stage === "invoiced" && owed > 0.004) return { key: "due", label: `Due${note}` };
  return { key: stage, label: `${STAGE_LABEL[stage]}${note}` };
}

/* ---- Help live check (calendar + documents): one set of status rules every view shares. ---- */
type AnyDoc = { id?: string; type?: string; data?: Record<string, unknown> | null };
const dataOf = (doc: AnyDoc) => (doc.data || {}) as Record<string, unknown>;
const statusOf = (doc: AnyDoc) => String(dataOf(doc).status || "draft");

/** Void (or voided) wins over every other status. */
export const isVoidDoc = (doc: AnyDoc) => ["void", "voided"].includes(statusOf(doc));
export const isChangeOrder = (doc: AnyDoc) => {
  const of = dataOf(doc).changeOrderOf as { id?: string; number?: string } | undefined;
  return doc.type === "invoice" && Boolean(of?.id || of?.number);
};

/** A proposal that already became a (non-void, non-deleted) invoice, or that the server marked invoiced. */
export function isConvertedProposal(doc: AnyDoc, allDocs: AnyDoc[] = []) {
  if (doc.type !== "proposal") return false;
  const data = dataOf(doc);
  if (statusOf(doc) === "invoiced" || (data.invoicedAs as { id?: string } | undefined)?.id) return true;
  return Boolean(doc.id) && allDocs.some((other) => other.type === "invoice" && !isVoidDoc(other) && !dataOf(other).deleted
    && (dataOf(other).fromProposal as { id?: string } | undefined)?.id === doc.id);
}

/**
 * The NOT APPROVED tag: only a proposal not yet approved (and not converted), or a change order
 * sent for approval and still pending. A plain invoice never needs approval.
 */
export function needsApproval(doc: AnyDoc, allDocs: AnyDoc[] = []) {
  if (isVoidDoc(doc)) return false;
  const approval = dataOf(doc).approval as { status?: string } | undefined;
  if (doc.type === "proposal") {
    if (isConvertedProposal(doc, allDocs)) return false;
    return !(approval?.status === "approved" || ["accepted", "approved"].includes(statusOf(doc)));
  }
  if (isChangeOrder(doc)) return approval?.status === "pending";
  return false;
}

/** Unsent draft: still status draft and no approval link sent. */
export const isUnsentDraft = (doc: AnyDoc) => !isVoidDoc(doc) && statusOf(doc) === "draft" && !(dataOf(doc).approval as { status?: string } | undefined)?.status;

/** Whether an invoice still has money due (for "Due:" markers and due lists). */
export function isDueInvoice(doc: AnyDoc) {
  if (doc.type !== "invoice" || isVoidDoc(doc)) return false;
  const shown = displayStatus(doc as Doc);
  return !["paid", "refunded", "partially_refunded", "partially-refunded", "void"].includes(shown.key) && docAmounts(doc as Doc).owed > 0.004;
}

/** Hidden from the calendar: void docs and proposals that already have their invoice. */
export const hiddenFromCalendar = (doc: AnyDoc, allDocs: AnyDoc[] = []) => isVoidDoc(doc) || isConvertedProposal(doc, allDocs) || Boolean(dataOf(doc).deleted);

/** The Unscheduled list: open work only (never void, paid, converted, or already scheduled). */
export function belongsInUnscheduled(doc: AnyDoc, allDocs: AnyDoc[], hasSchedule: boolean) {
  if (hasSchedule || hiddenFromCalendar(doc, allDocs)) return false;
  if (doc.type !== "invoice" && doc.type !== "proposal") return false;
  return !["paid", "refunded"].includes(displayStatus(doc as Doc, allDocs as Doc[]).key) && statusOf(doc) !== "paid";
}

/** Row stage + next step that agree with the status chip (Overdue/Partially paid → collect payment, Void → none). */
export function rowStage(doc: AnyDoc, allDocs: AnyDoc[] = [], today?: string) {
  const base = documentStage(doc as Doc, allDocs as Doc[]);
  if (isVoidDoc(doc)) return { stage: base.stage, next: "none" as const, void: true };
  const key = displayStatus(doc as Doc, allDocs as Doc[], today).key;
  if (doc.type === "invoice" && (key === "overdue" || key === "partial" || key === "due")) return { stage: "invoiced" as const, next: "collect-payment" as const, void: false };
  return { ...base, void: false };
}

/** The job-message helper on the invoice page: none for void, "complete" once paid or done. */
export function jobMessageKind(status: string, scheduleStatus: string | undefined): "" | "complete" | "scheduled" {
  if (["void", "voided"].includes(status)) return "";
  if (status === "paid" || scheduleStatus === "done") return "complete";
  return "scheduled";
}

/** List rows: the real document status next to the job status ("Paid · Job done"). */
export function jobRowLabel(doc: AnyDoc, allDocs: AnyDoc[], jobStatus: string) {
  const shown = displayStatus(doc as Doc, allDocs as Doc[]);
  if (shown.key === "void") return "Void";
  const tag = needsApproval(doc, allDocs) ? "Not approved" : shown.label;
  return `${tag} · Job ${jobStatus.toLowerCase()}`;
}
