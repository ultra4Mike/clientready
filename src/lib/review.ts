import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, isOpenBalance, paidTotal, readPayments } from "@/lib/payments";
import { readApproval } from "@/lib/approval";
import { readSchedule } from "@/lib/schedule";
import { isPendingRecurringDraft, readRecurring, ymd } from "@/lib/recurring";
import { readChangeOrderOf } from "@/lib/change-orders";
import { saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";

/**
 * Owner "Needs review" list. Everything is derived from existing data; the only thing stored is
 * data.reviews on the related document: { "<item key>": "<version>" }. An item is hidden while the
 * stored version matches its current version, so it comes back if it changes materially
 * (e.g. the balance changes, a new approval link is sent, the expense amount is edited).
 * Reviewing never touches status, payments or any money field.
 */
export type ReviewKind = "expense" | "done" | "balance" | "approval" | "recurring" | "change";
export type ReviewItem = { key: string; version: string; kind: ReviewKind; docId: string; title: string; detail: string; href: string };
export type ExpenseRow = { id: string; doc_id: string; worker_name?: string; kind?: string; amount?: string; note?: string; created_at?: string };

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };

const money = (value: number) => `$${value.toFixed(2)}`;

export function docTotal(doc: Doc) {
  const items = (doc.data?.items as { qty?: string; rate?: string }[] | undefined) || [];
  const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}

export function readReviews(data: Record<string, unknown> | undefined): Record<string, string> {
  const raw = data?.reviews;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
}

function numberOf(doc: Doc) {
  return String(doc.data?.invoiceNumber || doc.title || (doc.type === "proposal" ? "Proposal" : "Invoice"));
}

export function reviewItems(docs: Doc[], expenses: ExpenseRow[], today = ymd(new Date())): ReviewItem[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const all: ReviewItem[] = [];
  const open = (doc: Doc) => `/invoice?id=${encodeURIComponent(doc.id)}`;
  const who = (doc: Doc) => (doc.clientName && doc.clientName !== "No client" ? ` · ${doc.clientName}` : "");

  for (const row of expenses) {
    const doc = byId.get(row.doc_id);
    if (!doc) continue; // nowhere to store the review; job was deleted
    const amount = amountOf(row.amount);
    all.push({
      key: `expense:${row.id}`, version: `${amount.toFixed(2)}|${row.kind || ""}`, kind: "expense", docId: doc.id,
      title: `${row.worker_name || "Crew"} spent ${money(amount)} (${row.kind || "other"})`,
      detail: `${numberOf(doc)}${who(doc)}${row.note ? ` · ${row.note}` : ""}`, href: `${open(doc)}#crew-spend`,
    });
  }

  for (const doc of docs) {
    const data = doc.data || {};
    const schedule = readSchedule(data);
    if (schedule?.status === "done" && !schedule.confirmedAt) {
      all.push({ key: "done", version: schedule.doneAt || `${schedule.date}|${schedule.startTime}`, kind: "done", docId: doc.id,
        title: `Crew marked ${numberOf(doc)} done`, detail: `${schedule.date}${schedule.doneBy ? ` · ${schedule.doneBy}` : ""}${who(doc)} · awaiting your confirmation`, href: `${open(doc)}#job-done` });
    }
    const approval = readApproval(data.approval);
    if (doc.type === "proposal" && approval?.status === "pending") {
      all.push({ key: "approval", version: approval.createdAt, kind: "approval", docId: doc.id,
        title: `${numberOf(doc)} waiting for client approval`, detail: `Link sent ${approval.createdAt.slice(0, 10)}${who(doc)}`, href: open(doc) });
    }
    if (doc.type !== "invoice") continue;
    const changeOf = readChangeOrderOf(data.changeOrderOf);
    const status = String(data.status || "draft");
    if (isPendingRecurringDraft(doc)) {
      all.push({ key: "recurring", version: money(docTotal(doc)), kind: "recurring", docId: doc.id,
        title: `Recurring draft ${numberOf(doc)} ready to review`, detail: `${money(docTotal(doc))}${who(doc)} · not sent`, href: open(doc) });
      continue;
    }
    if (changeOf && status === "draft") {
      all.push({ key: "change", version: money(docTotal(doc)), kind: "change", docId: doc.id,
        title: `Change order ${numberOf(doc)} not confirmed`, detail: `For ${changeOf.number}${who(doc)} · ${money(docTotal(doc))} draft`, href: open(doc) });
      continue;
    }
    const recurring = readRecurring(data.recurring);
    if (recurring?.active && recurring.nextRunDate && recurring.nextRunDate <= today) {
      all.push({ key: "recurring-due", version: recurring.nextRunDate, kind: "recurring", docId: doc.id,
        title: `${numberOf(doc)} recurring invoice due`, detail: `Next run ${recurring.nextRunDate}${who(doc)}`, href: open(doc) });
    }
    const owed = balanceDue(docTotal(doc), paidTotal(readPayments(data as never)), data.status);
    if (isOpenBalance(status, owed)) {
      all.push({ key: "balance", version: owed.toFixed(2), kind: "balance", docId: doc.id,
        title: `${numberOf(doc)} has ${money(owed)} owed`, detail: `${status}${data.dueDate ? ` · due ${data.dueDate}` : ""}${who(doc)}`, href: open(doc) });
    }
  }
  return all.filter((item) => readReviews(byId.get(item.docId)?.data)[item.key] !== item.version);
}

/** Stores the reviewed version on the document (local + cloud). Only data.reviews changes. */
export async function markReviewed(item: ReviewItem) {
  const raw = window.localStorage.getItem("clientready-documents");
  const docs = (raw ? JSON.parse(raw) : []) as CloudDoc[];
  const doc = docs.find((entry) => entry.id === item.docId);
  if (!doc) return docs;
  const data = { ...(doc.data || {}), reviews: { ...readReviews(doc.data), [item.key]: item.version } };
  const updated = { ...doc, data };
  const cloudId = await saveCloudDocument(updated); // stamps data.updatedAt
  const fresh = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as CloudDoc[];
  const next = fresh.map((entry) => (entry.id === doc.id ? { ...updated, id: cloudId || doc.id } : entry));
  window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  return next;
}
