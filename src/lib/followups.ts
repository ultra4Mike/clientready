// Owner-tap follow-up drafts: quotes waiting for approval, tomorrow's appointment reminders and
// seasonal reminders (a client who had a job around this time last year and nothing booked since).
// Nothing here sends anything; the owner opens each draft in their own text/email app.
import { documentStage } from "@/lib/doc-stage";
import { readApproval } from "@/lib/approval";
import { readEmailLog } from "@/lib/email";
import { readSchedule } from "@/lib/schedule";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type FollowUp = { key: string; kind: "quote" | "appointment" | "seasonal"; docId: string; title: string; clientName: string; phone: string; email: string; subject: string; body: string; sinceDays?: number };

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

/** "Tue Oct 21" for a YYYY-MM-DD day (local date, no time zone shift). */
export function shortDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const date = new Date(y, m - 1, d);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
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
        body: `Hi ${first(clientName)}, this is ${biz(businessName)} with a reminder that we're scheduled for tomorrow, ${shortDay(tomorrow)}${timeText(schedule.startTime)}. Reply here if you need to change it. See you then!` });
    }
  }
  out.push(...seasonalFollowUps(docs, today, businessName));
  const rank = { appointment: 0, quote: 1, seasonal: 2 } as const;
  return out.sort((a, b) => (a.kind === b.kind ? (b.sinceDays || 0) - (a.sinceDays || 0) : rank[a.kind] - rank[b.kind]));
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

/** Seasonal window: last year's job dated from 14 days before to 30 days after today's date a year ago. */
export const SEASON_BEFORE_DAYS = 14;
export const SEASON_AFTER_DAYS = 30;
/** Anything for the client in the last 60 days (or scheduled ahead) means they're already booked. */
export const SEASON_RECENT_DAYS = 60;
const SKIP_KEY = "clientready-seasonal-skip";

function shift(today: string, days: number) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}
const clientOf = (doc: Doc) => {
  const data = doc.data || {};
  const id = s(data.clientId);
  const name = (s(data.clientName) || doc.clientName || "").trim();
  return { key: id ? `id:${id}` : `name:${name.toLowerCase()}`, name };
};

/** Owner chose "Skip this year" for a client: { clientKey: year }. */
export function seasonalSkips(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(SKIP_KEY) || "{}"); } catch { return {}; }
}
export function skipSeasonal(clientKey: string, year: string) {
  const next = { ...seasonalSkips(), [clientKey]: year };
  window.localStorage.setItem(SKIP_KEY, JSON.stringify(next));
  return next;
}

export function seasonalFollowUps(docs: Doc[], today: string, businessName: string, skips: Record<string, string> = seasonalSkips()): FollowUp[] {
  const yearAgo = shift(today, -365);
  const from = shift(yearAgo, -SEASON_BEFORE_DAYS);
  const to = shift(yearAgo, SEASON_AFTER_DAYS);
  const recent = shift(today, -SEASON_RECENT_DAYS);
  const year = today.slice(0, 4);
  const lastYear = new Map<string, Doc>();
  const booked = new Set<string>();
  for (const doc of docs) {
    if (doc.type !== "invoice" && doc.type !== "proposal") continue;
    const client = clientOf(doc);
    if (!client.name) continue;
    const data = doc.data || {};
    const date = ymd(s(data.invoiceDate) || s(doc.createdAt));
    const schedule = doc.type === "invoice" ? readSchedule(data) : null;
    if (date >= recent || (schedule && schedule.date >= today)) booked.add(client.key);
    if (doc.type !== "invoice" || s(data.status) === "draft" || date < from || date > to) continue;
    const seen = lastYear.get(client.key);
    if (!seen || date > ymd(s(seen.data?.invoiceDate) || s(seen.createdAt))) lastYear.set(client.key, doc);
  }
  const out: FollowUp[] = [];
  for (const [key, doc] of lastYear) {
    if (booked.has(key) || skips[key] === year) continue;
    const data = doc.data || {};
    const clientName = clientOf(doc).name;
    const items = Array.isArray(data.items) ? (data.items as { description?: unknown }[]) : [];
    const what = s(items.find((item) => s(item.description).trim())?.description).trim();
    const date = ymd(s(data.invoiceDate) || s(doc.createdAt));
    const month = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
    out.push({
      key: `season:${key}:${year}`, kind: "seasonal", docId: doc.id, title: s(data.invoiceNumber) || doc.title || "", clientName, phone: s(data.clientPhone), email: s(data.clientEmail),
      sinceDays: daysBetween(date, today), subject: `Time for your ${what ? what.toLowerCase() : "service"} again?`,
      body: `Hi ${first(clientName)}, this is ${biz(businessName)}. Last ${month} we did ${what ? what.charAt(0).toLowerCase() + what.slice(1) : "a job"} for you. Want us to get you on the schedule again this year? Just reply here and we'll set it up. Thank you!`,
    });
  }
  return out;
}
