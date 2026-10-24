import { localDayOf } from "@/lib/local-day";
import { readApproval } from "@/lib/approval";
import { readPayments } from "@/lib/payments";
import { readStages, stagePlan, todayYmd } from "@/lib/stages";

/**
 * Customer portal timeline: one newest-first list across this client's shared documents, built only from
 * the customer-safe data the portal already receives (no schedule, crew, costs, emails or payment refs).
 * Upcoming plan payments are listed first as "upcoming".
 */
export type PortalTimelineItem = { key: string; date: string; kind: "sent" | "approved" | "payment" | "paid" | "due"; title: string; amount?: number; docId: string; upcoming?: boolean };
type Doc = { id: string; type: string; title: string; data: Record<string, unknown> };
type Figures = { total: number; owed: number };

export const ymd = localDayOf;
const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

export function portalTimeline(docs: (Doc & Figures)[], today = todayYmd(), businessName = ""): PortalTimelineItem[] {
  const out: PortalTimelineItem[] = [];
  for (const doc of docs) {
    const kind = doc.type === "proposal" ? "Proposal" : "Invoice";
    const name = `${kind} ${String(doc.data.invoiceNumber || doc.title || "")}`.trim();
    const sent = ymd(doc.data.invoiceDate);
    if (sent) out.push({ key: `sent-${doc.id}`, date: sent, kind: "sent", title: `${name} sent`, amount: doc.total, docId: doc.id });
    const approval = readApproval(doc.data.approval);
    if (approval?.status === "approved" && ymd(approval.approvedAt)) out.push({ key: `ok-${doc.id}`, date: ymd(approval.approvedAt), kind: "approved", title: approval.method === "phone" ? `${name} approved by phone${businessName.trim() ? ` (recorded by ${businessName.trim()})` : ""}` : approval.method ? `${name} marked approved${businessName.trim() ? ` (recorded by ${businessName.trim()})` : ""}` : `${name} approved${approval.approverName ? ` by ${approval.approverName}` : ""}`, docId: doc.id });
    if (doc.type !== "invoice") continue;
    const payments = readPayments(doc.data).filter((payment) => num(payment.amount) > 0);
    payments.forEach((payment, index) => out.push({ key: `pay-${doc.id}-${index}`, date: ymd(payment.date) || sent, kind: "payment", title: `Payment received${payment.method ? ` (${payment.method})` : ""} · ${name}`, amount: num(payment.amount), docId: doc.id }));
    if (doc.total > 0 && doc.owed <= 0.004 && (payments.length || doc.data.status === "paid")) {
      const last = payments.map((payment) => ymd(payment.date)).filter(Boolean).sort().pop() || ymd(doc.data.paidAt) || "";
      if (last) out.push({ key: `paid-${doc.id}`, date: last, kind: "paid", title: `${name} paid in full`, docId: doc.id });
    }
    const stages = readStages(doc.data.stages);
    if (stages.length && doc.owed > 0.004) {
      for (const row of stagePlan(doc.total, doc.owed, stages, today).rows) {
        if (row.state === "paid" || !row.dueDate) continue;
        out.push({ key: `due-${doc.id}-${row.id}`, date: row.dueDate, kind: "due", title: `${row.label || "Payment"} ${row.state === "overdue" ? "overdue" : "due"} · ${name}`, amount: row.remaining, docId: doc.id, upcoming: row.dueDate >= today });
      }
    } else if (doc.owed > 0.004 && ymd(doc.data.dueDate)) {
      const due = ymd(doc.data.dueDate);
      out.push({ key: `due-${doc.id}`, date: due, kind: "due", title: `${name} ${due < today ? "overdue" : "due"}`, amount: doc.owed, docId: doc.id, upcoming: due >= today });
    }
  }
  const upcoming = out.filter((item) => item.upcoming).sort((a, b) => a.date.localeCompare(b.date));
  const past = out.filter((item) => !item.upcoming).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  return [...upcoming, ...past];
}
