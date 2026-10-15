import { readPayments } from "@/lib/payments";
import { isOpenBalance } from "@/lib/payments";
import { clientIdFor, clientKey } from "@/lib/portal";
import { readSchedule, statusLabel } from "@/lib/schedule";
import { readEmailLog } from "@/lib/email";
import { docAmounts, documentStage } from "@/lib/doc-stage";

type Doc = { id: string; type: string; title: string; clientName: string; createdAt: string; data: Record<string, unknown> };
export type TimelineClient = { id: string; name: string; notes?: string };

/** Same shape as the design bot's TimelineItem, plus a stable key. date is YYYY-MM-DD ("" = undated note). */
export type ClientTimelineItem = { key: string; date: string; type: "invoice" | "proposal" | "payment" | "job" | "note" | "email"; title: string; amount?: number; status?: string; href?: string };

const ymdOf = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "");

function docDate(doc: Doc) {
  const fromData = ymdOf(doc.data?.invoiceDate);
  if (fromData) return fromData;
  const parsed = Date.parse(doc.createdAt);
  if (Number.isNaN(parsed)) return "";
  const date = new Date(parsed);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** This client's documents: by stored clientId, else (legacy) the one saved client with that name. */
export function clientDocs<T extends Doc>(client: TimelineClient, docs: T[], clients: TimelineClient[]) {
  return docs.filter((doc) => {
    if (doc.type !== "invoice" && doc.type !== "proposal") return false;
    const id = clientIdFor(doc, clients);
    if (id) return id === client.id;
    return clientKey(String(doc.data?.clientName || doc.clientName || "")) === clientKey(client.name);
  });
}

/**
 * One client's history as a single newest-first list (documents, payments, scheduled jobs, emails, notes)
 * and totals. Billed = non-draft invoices; paid = recorded payments; owed = open balances (same rule as Collect).
 */
export function clientTimeline(client: TimelineClient, docs: Doc[], clients: TimelineClient[]) {
  const mine = clientDocs(client, docs, clients);
  const items: ClientTimelineItem[] = [];
  let billed = 0;
  let paid = 0;
  let owed = 0;
  for (const doc of mine) {
    const number = String(doc.data?.invoiceNumber || doc.title || "");
    const status = String(doc.data?.status || "draft");
    const amounts = docAmounts(doc);
    const kind = doc.type === "proposal" ? "proposal" : "invoice";
    const href = `/invoice?id=${encodeURIComponent(doc.id)}`;
    items.push({ key: `doc-${doc.id}`, date: docDate(doc), type: kind, title: `${kind === "proposal" ? "Proposal" : "Invoice"} ${number}`.trim(), amount: amounts.total, status: documentStage(doc, docs).stage, href });
    if (doc.type === "invoice") {
      if (status !== "draft") billed += amounts.total;
      paid += amounts.paid;
      if (isOpenBalance(status, amounts.owed)) owed += amounts.owed;
      readPayments(doc.data).forEach((payment, index) => {
        const amount = Number(payment.amount) || 0;
        if (amount > 0) items.push({ key: `pay-${doc.id}-${index}`, date: ymdOf(payment.date), type: "payment", title: `Payment${payment.method ? ` · ${payment.method}` : ""} · ${number}`, amount, status: "paid", href });
      });
    }
    const schedule = readSchedule(doc.data);
    if (schedule) items.push({ key: `job-${doc.id}`, date: schedule.date, type: "job", title: `Job · ${number}${schedule.startTime ? ` · ${schedule.startTime}` : ""}`, status: statusLabel(schedule), href });
    readEmailLog(doc.data?.emailLog).forEach((entry, index) => {
      items.push({ key: `email-${doc.id}-${index}`, date: ymdOf(entry.sentAt), type: "email", title: `Email · ${entry.subject}`, status: entry.via === "email" ? "sent" : "opened in email app", href });
    });
  }
  // Newest first; undated entries last; the client's own notes pinned on top.
  items.sort((a, b) => (a.date && b.date ? b.date.localeCompare(a.date) : a.date ? -1 : b.date ? 1 : 0));
  if (client.notes?.trim()) items.unshift({ key: "note", date: "", type: "note", title: client.notes.trim() });
  const round = (value: number) => Math.round(value * 100) / 100;
  return { items, docs: mine, totals: { billed: round(billed), paid: round(paid), owed: round(owed) } };
}
