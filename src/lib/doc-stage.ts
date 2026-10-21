import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, paidTotal, readPayments } from "@/lib/payments";
import { readApproval } from "@/lib/approval";
import { readSchedule } from "@/lib/schedule";

/**
 * Where a document is in the job flow, and the one next thing the owner can do. Read-only:
 * nothing here changes a status or any money field.
 */
export type DocStage = "draft" | "sent" | "approved" | "scheduled" | "invoiced" | "paid";
export type NextAction =
  | "send" // draft: review and send / share it
  | "await-approval" // proposal sent: waiting on the customer
  | "schedule" // approved proposal: put the job on the calendar
  | "create-invoice" // approved/scheduled proposal: make the invoice
  | "complete-job" // invoice with a scheduled job not done yet
  | "confirm-done" // crew marked it done: owner confirms
  | "collect-payment" // invoice sent with a balance
  | "none";

type Doc = { id?: string; type: string; data?: Record<string, unknown> };

/** Total, paid and still owed, with the same math the app uses everywhere. Proposals owe nothing. */
export function docAmounts(doc: Doc) {
  const data = doc.data || {};
  const items = Array.isArray(data.items) ? (data.items as { qty?: unknown; rate?: unknown }[]) : [];
  const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
  const total = documentTotals(subtotal, String(data.taxPercent ?? ""), String(data.discountType ?? ""), String(data.discountValue ?? "")).total;
  const paid = doc.type === "invoice" ? paidTotal(readPayments(data)) : 0;
  const owed = doc.type === "invoice" ? balanceDue(total, paid, data.status) : 0;
  return { total, paid, owed };
}

export function documentStage(doc: Doc, allDocs: Doc[] = []): { stage: DocStage; next: NextAction } {
  const data = doc.data || {};
  const status = String(data.status || "draft");
  const approval = readApproval(data.approval);
  const schedule = readSchedule(data);
  if (doc.type === "proposal") {
    const invoiced = Boolean(doc.id) && allDocs.some((other) => other.type === "invoice" && (other.data?.fromProposal as { id?: string } | undefined)?.id === doc.id);
    if (invoiced) return { stage: "invoiced", next: "none" };
    if (approval?.status === "approved" || status === "approved" || status === "accepted") {
      return schedule ? { stage: "scheduled", next: "create-invoice" } : { stage: "approved", next: "schedule" };
    }
    if (status === "draft" && !approval) return { stage: "draft", next: "send" };
    return { stage: "sent", next: "await-approval" };
  }
  const { total, owed } = docAmounts(doc);
  if (status === "paid" || (total > 0 && owed <= 0.004)) return { stage: "paid", next: "none" };
  // R58: a client who approved through the link moves an invoice past Draft/Sent to Approved.
  const approved = approval?.status === "approved";
  if (status === "draft" && !approved) return { stage: "draft", next: "send" };
  if (schedule && !(schedule.status === "done" && schedule.confirmedAt)) {
    return { stage: "scheduled", next: schedule.status === "done" ? "confirm-done" : "complete-job" };
  }
  if (approved && !schedule) return { stage: "approved", next: owed > 0.004 ? "collect-payment" : "none" };
  return { stage: "invoiced", next: owed > 0.004 ? "collect-payment" : "none" };
}

/** Pipeline order (for steppers). */
export const STAGES: DocStage[] = ["draft", "sent", "approved", "scheduled", "invoiced", "paid"];
export const STAGE_LABEL: Record<DocStage, string> = { draft: "Draft", sent: "Sent", approved: "Approved", scheduled: "Scheduled", invoiced: "Invoiced", paid: "Paid" };
export const NEXT_LABEL: Record<NextAction, string> = {
  send: "Send it", "await-approval": "Waiting for approval", schedule: "Schedule the job", "create-invoice": "Create the invoice",
  "complete-job": "Complete the job", "confirm-done": "Confirm job done", "collect-payment": "Collect payment", none: "",
};

/** R84: money collected = paid on every sent (non-draft) invoice, part payments included. Dashboard and Documents both use this. */
export function collectedOn(doc: Doc) {
  if (doc.type !== "invoice" || String(doc.data?.status || "draft") === "draft") return 0;
  const { total, owed } = docAmounts(doc);
  return Math.max(total - owed, 0);
}
