// Owner-tap follow-up drafts: quotes waiting for approval, and tomorrow's appointment reminders.
// Nothing here sends anything; the owner opens each draft in their own text/email app.
import { documentStage } from "@/lib/doc-stage";
import { readApproval } from "@/lib/approval";
import { readEmailLog } from "@/lib/email";
import { readSchedule } from "@/lib/schedule";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type FollowUp = { key: string; kind: "quote" | "appointment"; docId: string; title: string; clientName: string; phone: string; email: string; subject: string; body: string; sinceDays?: number };

export const QUOTE_FOLLOWUP_DAYS = 3;
const s = (value: unknown) => (typeof value === "string" ? value : "");
const first = (name: string) => name.trim().split(/\s+/)[0] || "there";
const biz = (name: string) => (name.trim() && name !== "Your business" ? name.trim() : "us");
const ymd = (value: string) => value.slice(0, 10);
function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
}
function timeText(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return ` at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** When the quote last went out: newest of approval link created, emails logged, or the quote date. */
export function quoteSentOn(doc: Doc): string {
  const data = doc.data || {};
  const dates = [ymd(readApproval(data.approval)?.createdAt || ""), ...readEmailLog(data.emailLog).map((entry) => ymd(entry.sentAt)), s(data.invoiceDate), ymd(s(doc.createdAt))].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return dates.sort().at(-1) || "";
}

export function followUps(docs: Doc[], today: string, businessName: string, approvalUrl: (doc: Doc) => string = () => ""): FollowUp[] {
  const out: FollowUp[] = [];
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(y, m - 1, d + 1);
  const tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  for (const doc of docs) {
    const data = doc.data || {};
    const clientName = s(data.clientName) || doc.clientName || "";
    const base = { docId: doc.id, title: s(data.invoiceNumber) || doc.title || "", clientName, phone: s(data.clientPhone), email: s(data.clientEmail) };
    if (doc.type === "proposal" && documentStage(doc, docs).stage === "sent") {
      const sent = quoteSentOn(doc);
      const since = sent ? daysBetween(sent, today) : 0;
      if (since < QUOTE_FOLLOWUP_DAYS) continue;
      const link = approvalUrl(doc);
      out.push({ ...base, key: `quote:${doc.id}:${sent}`, kind: "quote", sinceDays: since, subject: `Following up on your quote${base.title ? ` ${base.title}` : ""}`,
        body: `Hi ${first(clientName)}, this is ${biz(businessName)} following up on the quote we sent${base.title ? ` (${base.title})` : ""}. Any questions, or would you like to go ahead?${link ? ` You can review and approve it here: ${link}` : ""} Thank you!` });
    }
    if (doc.type === "invoice") {
      const schedule = readSchedule(data);
      if (!schedule || schedule.date !== tomorrow || schedule.status !== "scheduled") continue;
      out.push({ ...base, key: `appt:${doc.id}:${schedule.date}${schedule.startTime || ""}`, kind: "appointment", subject: "Appointment reminder",
        body: `Hi ${first(clientName)}, this is ${biz(businessName)} with a reminder that we're scheduled for tomorrow${timeText(schedule.startTime)}. Reply here if you need to change it. See you then!` });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? (b.sinceDays || 0) - (a.sinceDays || 0) : a.kind === "appointment" ? -1 : 1));
}

const OPENED_KEY = "clientready-followups-opened";
export function followUpOpened(key: string): string {
  try { return (JSON.parse(window.localStorage.getItem(OPENED_KEY) || "{}") || {})[key] || ""; } catch { return ""; }
}
export function noteFollowUpOpened(key: string) {
  let all: Record<string, string> = {};
  try { all = JSON.parse(window.localStorage.getItem(OPENED_KEY) || "{}") || {}; } catch { all = {}; }
  all[key] = new Date().toISOString();
  window.localStorage.setItem(OPENED_KEY, JSON.stringify(all));
  return all[key];
}
