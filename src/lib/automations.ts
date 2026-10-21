/**
 * Backlog 13: optional automations. Every switch is OFF until the owner turns it on in Profile.
 * There is no server cron: they run when the owner's app opens the dashboard (like recurring drafts).
 * Each send goes through the owner's email setup (/api/email/send) and is logged on the invoice
 * (emailLog + autoSent), so it never repeats by accident. Money fields are never changed.
 */
import { sendEmail, logEmail, emailSendingEnabled } from "@/lib/email";
import { docAmounts } from "@/lib/doc-stage";
import { invoicePastDue } from "@/lib/payments";
import { reviewMessage } from "@/lib/review-request";
import { clientOptedOut } from "@/lib/review-request";

export type Automations = { doneEmailInvoice: boolean; doneIncludeReview: boolean; lateReminderEmail: boolean };
export const AUTOMATIONS_OFF: Automations = { doneEmailInvoice: false, doneIncludeReview: false, lateReminderEmail: false };
export const LATE_REMINDER_DAYS = 7;
export const LATE_REMINDER_MAX = 3;

export function readAutomations(value: unknown): Automations {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { doneEmailInvoice: v.doneEmailInvoice === true, doneIncludeReview: v.doneIncludeReview === true, lateReminderEmail: v.lateReminderEmail === true };
}

type Doc = { id: string; type: string; title?: string; clientName?: string; data?: Record<string, unknown> };
export type AutoSent = { done?: string; late?: string[] };
export type AutoPlan = { docId: string; kind: "done" | "late"; to: string; subject: string; text: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readAutoSent(value: unknown): AutoSent {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { ...(typeof v.done === "string" ? { done: v.done } : {}), ...(Array.isArray(v.late) ? { late: v.late.map(String) } : {}) };
}

/** Pure: which emails the switches would send now. */
export function planAutomations(docs: Doc[], settings: Automations, ctx: { business: string; reviewLink: string; origin: string; now?: Date }): AutoPlan[] {
  const now = ctx.now || new Date();
  const out: AutoPlan[] = [];
  for (const doc of docs) {
    if (doc.type !== "invoice" || !UUID.test(doc.id)) continue;
    const data = doc.data || {};
    const to = String(data.clientEmail || "").trim();
    if (!EMAIL.test(to)) continue;
    const { total, owed } = docAmounts(doc as never);
    if (!(owed > 0.004) || String(data.status || "draft") === "paid") continue;
    const sent = readAutoSent(data.autoSent);
    const number = String(data.invoiceNumber || doc.title || "your invoice");
    const token = String(((data.approval || {}) as { token?: unknown }).token || "");
    const link = token ? `${ctx.origin}/approve?t=${encodeURIComponent(token)}` : "";
    const first = String(doc.clientName || data.clientName || "").trim().split(/\s+/)[0] || "there";
    const schedule = (data.schedule || {}) as { status?: unknown; confirmedAt?: unknown };
    if (settings.doneEmailInvoice && schedule.status === "done" && schedule.confirmedAt && !sent.done) {
      const review = settings.doneIncludeReview && ctx.reviewLink.trim() && !clientOptedOut(String(data.clientId || ""), String(doc.clientName || ""))
        ? `\n\n${reviewMessage(String(doc.clientName || ""), ctx.business, ctx.reviewLink, false)}` : "";
      out.push({ docId: doc.id, kind: "done", to, subject: `Invoice ${number} from ${ctx.business}`,
        text: `Hi ${first},\n\nThe job is done. Invoice ${number} is $${owed.toFixed(2)}${owed < total - 0.004 ? ` (remaining balance of $${total.toFixed(2)})` : ""}.${link ? `\nView and pay: ${link}` : ""}\n\nThank you,\n${ctx.business}${review}` });
      continue;
    }
    if (settings.lateReminderEmail && invoicePastDue(data, total, owed)) {
      const late = sent.late || [];
      const last = late.length ? Date.parse(late[late.length - 1]) : 0;
      if (late.length < LATE_REMINDER_MAX && (!last || now.getTime() - last >= LATE_REMINDER_DAYS * 86400000)) {
        out.push({ docId: doc.id, kind: "late", to, subject: `Reminder: invoice ${number} is past due`,
          text: `Hi ${first},\n\nA friendly reminder that invoice ${number} ($${owed.toFixed(2)} owed) was due ${String(data.dueDate || "")}.${link ? `\nView and pay: ${link}` : ""}\n\nThank you,\n${ctx.business}` });
      }
    }
  }
  return out;
}

/** Runs the plan (owner's app, dashboard load). Returns what was sent. Nothing runs when every switch is off. */
export async function runAutomations(): Promise<{ sent: AutoPlan[]; errors: string[] }> {
  let profile: Record<string, unknown> = {};
  try { profile = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}") || {}; } catch { profile = {}; }
  const settings = readAutomations(profile.automations);
  if (!settings.doneEmailInvoice && !settings.lateReminderEmail) return { sent: [], errors: [] };
  if (!(await emailSendingEnabled())) return { sent: [], errors: ["Automatic emails are on, but email sending is not set up."] };
  let docs: Doc[] = [];
  try { docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") || []; } catch { docs = []; }
  const plan = planAutomations(docs, settings, { business: String(profile.businessName || "Your business"), reviewLink: String(profile.reviewLink || ""), origin: window.location.origin });
  const sent: AutoPlan[] = []; const errors: string[] = [];
  for (const item of plan) {
    const result = await sendEmail(item.docId, item.to, item.subject, item.text);
    if (result.error) { errors.push(`${item.subject}: ${result.error}`); continue; }
    const at = new Date().toISOString();
    // Stamp first, then log (logEmail saves the document to the account).
    const all: Doc[] = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]");
    const doc = all.find((d) => d.id === item.docId);
    if (doc) {
      const prev = readAutoSent(doc.data?.autoSent);
      doc.data = { ...(doc.data || {}), autoSent: item.kind === "done" ? { ...prev, done: at } : { ...prev, late: [...(prev.late || []), at] } };
      window.localStorage.setItem("clientready-documents", JSON.stringify(all));
    }
    await logEmail(item.docId, { sentAt: at, to: item.to, subject: item.subject, kind: item.kind === "done" ? "invoice" : "reminder", via: "email", id: result.id }, item.kind === "done");
    sent.push(item);
  }
  return { sent, errors };
}
