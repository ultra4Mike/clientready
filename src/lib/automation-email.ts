import { greetingName } from "@/lib/reminders";
/**
 * Automated email content (Help R46-R51). Pure: used by the owner's app to plan and by /api/email/send,
 * which rebuilds the email from the saved invoice so automated sends are templated and go only to the
 * invoice's client. Each email has a (kind, period) key the server claims once.
 */
import { docAmounts } from "@/lib/doc-stage";
import { invoicePastDue } from "@/lib/payments";
import { readStages, stagePlan } from "@/lib/stages";

export type Automations = { doneEmailInvoice: boolean; doneIncludeReview: boolean; lateReminderEmail: boolean };
export const AUTOMATIONS_OFF: Automations = { doneEmailInvoice: false, doneIncludeReview: false, lateReminderEmail: false };
export const LATE_REMINDER_DAYS = 7;
export const LATE_REMINDER_MAX = 3;
export const AUTO_OPT_OUT_LINE = "Prefer not to get automatic emails from us? Just reply and we'll stop.";

export function readAutomations(value: unknown): Automations {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { doneEmailInvoice: v.doneEmailInvoice === true, doneIncludeReview: v.doneIncludeReview === true, lateReminderEmail: v.lateReminderEmail === true };
}

export type AutoDoc = { id: string; type: string; title?: string; clientName?: string; data?: Record<string, unknown> };
export type AutoKind = "done" | "late";
export type AutoPlan = { docId: string; kind: AutoKind; period: string; to: string; subject: string; text: string };
export type AutoCtx = { business: string; reviewLink: string; origin: string; today: string; reviewOptOut: boolean; autoOptOut: boolean };

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (n: number) => `$${n.toFixed(2)}`;
const days = (from: string, to: string) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Keys already sent ("done:once", "late:2026-10-01#0"), from the doc log and the server claims. */
export function sentKeys(data: Record<string, unknown> | undefined): Set<string> {
  const v = ((data || {}).autoSent || {}) as { done?: unknown; late?: unknown; keys?: unknown };
  const out = new Set<string>(Array.isArray(v.keys) ? v.keys.map(String) : []);
  if (typeof v.done === "string") out.add("done:once");
  return out;
}

/** Is this invoice a real, sent invoice (not a draft or a recurring draft waiting for review)? */
export function isSendable(data: Record<string, unknown>) {
  const status = String(data.status || "draft");
  return status !== "draft" && status !== "paid" && !data.recurringReview;
}

/** The emails the switches allow for one invoice right now (at most one). */
export function planOne(doc: AutoDoc, settings: Automations, ctx: AutoCtx): AutoPlan | null {
  if (doc.type !== "invoice" || !UUID.test(doc.id) || ctx.autoOptOut) return null;
  const data = doc.data || {};
  const to = String(data.clientEmail || "").trim();
  if (!EMAIL.test(to) || !isSendable(data)) return null;
  const { total, owed } = docAmounts(doc as never);
  if (!(owed > 0.004)) return null;
  const sent = sentKeys(data);
  const number = String(data.invoiceNumber || doc.title || "your invoice");
  const token = String(((data.approval || {}) as { token?: unknown }).token || "");
  const link = token ? `\nView and pay: ${ctx.origin}/approve?t=${encodeURIComponent(token)}` : "";
  const first = greetingName(String(doc.clientName || data.clientName || ""), String(data.contactName || ""), String(data.clientCompany || ""));
  const biz = ctx.business.trim() || "Your business";
  const amount = owed < total - 0.004 ? `has ${money(owed)} remaining (of ${money(total)} total)` : `is ${money(total)}`;
  const schedule = (data.schedule || {}) as { status?: unknown; confirmedAt?: unknown };
  if (settings.doneEmailInvoice && schedule.status === "done" && schedule.confirmedAt && !sent.has("done:once")) {
    const review = settings.doneIncludeReview && ctx.reviewLink.trim() && !ctx.reviewOptOut
      ? `\n\nIf you were happy with the work, would you leave us a quick review? ${ctx.reviewLink.trim()}` : "";
    return { docId: doc.id, kind: "done", period: "once", to, subject: `Invoice ${number} from ${biz}`,
      text: `Hi ${first},\n\nThe job is done. Invoice ${number} ${amount}.${link}\n\nThank you,\n${biz}${review}\n\n${AUTO_OPT_OUT_LINE}` };
  }
  if (settings.lateReminderEmail && invoicePastDue(data, total, owed, ctx.today)) {
    // Which payment is overdue: the earliest overdue installment of a plan, else the invoice.
    const stages = readStages(data.stages);
    const row = stages.length ? stagePlan(total, owed, stages, ctx.today).rows.find((r) => r.state === "overdue") : null;
    const due = String((row ? row.dueDate : "") || data.dueDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
    const week = Math.floor(Math.max(0, days(due, ctx.today)) / LATE_REMINDER_DAYS);
    if (week >= LATE_REMINDER_MAX) return null;
    const period = `${due}#${week}`;
    if (sent.has(`late:${period}`)) return null;
    const what = row
      ? `the ${row.label || "scheduled"} payment of ${money(row.remaining)} on invoice ${number} was due ${due}`
      : `invoice ${number} (${money(owed)} owed${owed < total - 0.004 ? ` of ${money(total)}` : ""}) was due ${due}`;
    return { docId: doc.id, kind: "late", period, to, subject: `Reminder: invoice ${number} payment past due`,
      text: `Hi ${first},\n\nA friendly reminder that ${what}.${link}\n\nThank you,\n${biz}\n\n${AUTO_OPT_OUT_LINE}` };
  }
  return null;
}
