import { crewKindLabel } from "@/lib/cost-categories";
import { amountOf, documentTotals } from "@/lib/discount";
import { isOpenBalance, readPayments } from "@/lib/payments";
import { documentStage, STAGE_LABEL } from "@/lib/doc-stage";
import { readApproval } from "@/lib/approval";
import { readSchedule } from "@/lib/schedule";
import { allConflicts, clockText } from "@/lib/conflicts";
import { isPendingRecurringDraft, readRecurring, ymd } from "@/lib/recurring";
import { readChangeOrderOf } from "@/lib/change-orders";
import { effectiveAmounts } from "@/lib/change-order-revision";
import { saveCloudDocument, type CloudDoc } from "@/lib/cloud-docs";

/**
 * Owner "Needs review" list. Everything is derived from existing data; the only thing stored is
 * data.reviews on the related document: { "<item key>": "<version>" }. An item is hidden while the
 * stored version matches its current version, so it comes back if it changes materially
 * (e.g. the balance changes, a new approval link is sent, the expense amount is edited).
 * Reviewing never touches status, payments or any money field.
 */
/** Client approvals from the last 14 days are shown (older ones are history, not news). */
const recentCutoff = (today: string) => { const d = new Date(`${today}T12:00:00`); if (Number.isNaN(d.getTime())) return ""; d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); };

export type ReviewKind = "expense" | "done" | "balance" | "approval" | "recurring" | "change" | "missing" | "conflict";
export type ReviewItem = { key: string; version: string; kind: ReviewKind; docId: string; title: string; detail: string; href: string; amount?: number; costLabel?: string };
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

export type MissingField = "address" | "contact" | "due-date" | "signature" | "payment-method";
export const MISSING_LABEL: Record<MissingField, string> = {
  address: "client address", contact: "client email or phone", "due-date": "due date", signature: "client signature", "payment-method": "payment method",
};

/**
 * What a sent invoice still lacks (drafts are skipped): client address, a way to reach the client, a due date,
 * the client signature once the job is done or paid, and a method on every recorded payment.
 */
export function missingFields(doc: Doc): MissingField[] {
  const data = doc.data || {};
  const status = String(data.status || "draft");
  if (doc.type !== "invoice" || status === "draft" || ["void", "voided", "deleted"].includes(status) || data.deleted) return [];
  const text = (value: unknown) => String(value ?? "").trim();
  const out: MissingField[] = [];
  // R128: an address is only needed when there is no other way to reach or bill the client.
  if (!text(data.clientEmail) && !text(data.clientPhone)) out.push(text(data.clientAddress) ? "contact" : "address", ...(text(data.clientAddress) ? [] : ["contact" as MissingField]));
  // A schedule-driven due date counts: "due when the job is done" (auto-converted proposals) or a
  // payment schedule whose rows carry the dates.
  const stages = Array.isArray(data.stages) ? (data.stages as { dueDate?: string; kind?: string }[]) : [];
  const scheduleDue = data.dueOnCompletion === true || stages.some((row) => text(row.dueDate) || row.kind === "final");
  if (!text(data.dueDate) && !scheduleDue && status !== "paid") out.push("due-date");
  const done = readSchedule(data)?.status === "done" || status === "paid";
  // Any signature on file counts: the invoice's own, the proposal's, or the client's approval signature.
  const approvalSig = (data.approval as { signature?: unknown } | null | undefined)?.signature;
  // Only invoices that needed a client sign-off (made from a proposal, or the owner asked for one);
  // a plain invoice never needs a signature (R128: only proposals need approval).
  const needsSignature = Boolean((data.fromProposal as { id?: string } | undefined)?.id) || data.requireSignature === true;
  if (done && needsSignature && !data.signature && !data.proposalSignature && !approvalSig) out.push("signature");
  if (readPayments(data as never).some((payment) => (Number(payment.amount) || 0) > 0 && !text(payment.method))) out.push("payment-method");
  return [...new Set(out)];
}

export function reviewItems(allDocs: Doc[], expenses: ExpenseRow[], today = ymd(new Date())): ReviewItem[] {
  // QA4: a void or deleted document is never "done", missing a signature or anything else to review.
  const docs = allDocs.filter((doc) => !["void", "voided", "deleted"].includes(String(doc.data?.status || "")) && !doc.data?.deleted);
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
      title: `${row.worker_name || "Crew"} spent ${money(amount)} (${crewKindLabel(row.kind)})`,
      detail: `${numberOf(doc)}${who(doc)}${row.note ? ` · ${row.note}` : ""}`, href: `${open(doc)}#crew-spend`,
      amount, costLabel: `${row.worker_name || "Crew"}: ${crewKindLabel(row.kind)}${row.note ? ` (${String(row.note).slice(0, 60)})` : ""}`,
    });
  }

  // Double-bookings, re-checked on every load/sync (edits from another phone or offline included; Help R26).
  const workerNames = (() => { if (typeof window === "undefined") return new Map<string, string>(); try { return new Map((JSON.parse(window.localStorage.getItem("clientready-employees") || "[]") as { id: string; name?: string }[]).map((p) => [p.id, p.name || ""])); } catch { return new Map<string, string>(); } })();
  for (const c of allConflicts(docs)) {
    const doc = byId.get(c.docId);
    if (!doc) continue;
    all.push({ key: `conflict:${c.otherDocId}:${c.workerId}`, version: `${c.date}|${c.start}|${c.end}`, kind: "conflict", docId: c.docId,
      title: `${workerNames.get(c.workerId) || "A worker"} is double-booked on ${c.date}`, detail: `${c.title} and ${c.otherTitle} overlap ${clockText(c.start)}–${clockText(c.end)} · open the job to move it or Book anyway`, href: `${open(doc)}#schedule` });
  }

  for (const doc of docs) {
    const data = doc.data || {};
    const schedule = readSchedule(data);
    if (schedule?.status === "done" && !schedule.confirmedAt) {
      all.push({ key: "done", version: schedule.doneAt || `${schedule.date}|${schedule.startTime}`, kind: "done", docId: doc.id,
        // QA3: only say "Crew" when crew is assigned; otherwise the owner (or someone) marked it.
        title: schedule.workerIds.length || schedule.doneBy ? `Crew marked ${numberOf(doc)} done` : `${numberOf(doc)} marked done`, detail: `${schedule.date}${schedule.doneBy ? ` · ${schedule.doneBy}` : ""}${who(doc)} · awaiting your confirmation`, href: `${open(doc)}#job-done` });
    }
    const approval = readApproval(data.approval);
    // QA3: notify the owner when the client approves online (not owner-recorded phone approvals).
    if (doc.type === "proposal" && approval?.status === "approved" && !approval.method && !approval.markedBy && approval.approvedAt && approval.approvedAt.slice(0, 10) >= recentCutoff(today)) {
      all.push({ key: "client-approved", version: approval.approvedAt, kind: "approval", docId: doc.id,
        title: `Client approved ${numberOf(doc)}`, detail: `${approval.approverName ? `By ${approval.approverName} · ` : ""}${approval.approvedAt.slice(0, 10)}${who(doc)}`, href: open(doc) });
    }
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
    const gaps = missingFields(doc);
    if (gaps.length) {
      all.push({ key: "missing", version: gaps.join(","), kind: "missing", docId: doc.id,
        title: `${numberOf(doc)} is missing ${gaps.map((gap) => MISSING_LABEL[gap]).join(", ")}`, detail: `${STAGE_LABEL[documentStage(doc, docs).stage]}${who(doc)}`, href: open(doc) });
    }
    // R128: the shared refund-aware owed amount (a refund never reopens a balance).
    // QA3: a replaced or void invoice owes nothing here (its revision carries the balance).
    const eff = effectiveAmounts(docs as never, doc as never);
    const owed = eff.replaced ? 0 : eff.owed;
    if (!["void", "voided", "deleted"].includes(status) && isOpenBalance(status, owed)) {
      all.push({ key: "balance", version: owed.toFixed(2), kind: "balance", docId: doc.id,
        title: `${numberOf(doc)} has ${money(owed)} owed`, detail: `${STAGE_LABEL[documentStage(doc, docs).stage]}${data.dueDate ? ` · due ${data.dueDate}` : ""}${who(doc)}`, href: open(doc) });
    }
  }
  // One row per document + item (a document listed twice, e.g. local and cloud copy, shows once).
  const seen = new Set<string>();
  return all.filter((item) => {
    const id = `${item.docId}|${item.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return readReviews(byId.get(item.docId)?.data)[item.key] !== item.version;
  });
}

/**
 * QA3c: approving a crew expense adds it to the job's costs (Other fees, tagged with the expense id so it is
 * never added twice; an edited amount replaces the earlier line). Profit by job and the invoice pick it up.
 */
export function withCrewExpenseCost(data: Record<string, unknown>, item: Pick<ReviewItem, "key" | "amount" | "costLabel">) {
  const costs = { ...((data.jobCosts || {}) as Record<string, unknown>) };
  const fees = (Array.isArray(costs.otherFees) ? (costs.otherFees as { crewExpenseId?: string }[]) : []).filter((f) => f.crewExpenseId !== item.key);
  if ((item.amount || 0) > 0) fees.push({ label: item.costLabel || "Crew expense", amount: String(item.amount), crewExpenseId: item.key } as never);
  return { ...data, jobCosts: { ...costs, otherFees: fees } };
}

/** Stores the reviewed version on the document (local + cloud). Only data.reviews changes (plus job costs for an approved crew expense). */
export async function markReviewed(item: ReviewItem) {
  const raw = window.localStorage.getItem("clientready-documents");
  const docs = (raw ? JSON.parse(raw) : []) as CloudDoc[];
  const doc = docs.find((entry) => entry.id === item.docId);
  if (!doc) return docs;
  const base = item.kind === "expense" ? withCrewExpenseCost(doc.data || {}, item) : doc.data || {};
  const data = { ...base, reviews: { ...readReviews(doc.data), [item.key]: item.version } };
  const updated = { ...doc, data };
  const cloudId = await saveCloudDocument(updated); // stamps data.updatedAt
  const fresh = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as CloudDoc[];
  const next = fresh.map((entry) => (entry.id === doc.id ? { ...updated, id: cloudId || doc.id } : entry));
  window.localStorage.setItem("clientready-documents", JSON.stringify(next));
  return next;
}
