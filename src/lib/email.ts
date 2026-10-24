import { supabase } from "@/lib/supabase";
import { saveCloudDocument, getUserId, isUuid, type CloudDoc } from "@/lib/cloud-docs";
import { writeBases } from "@/lib/three-way";
import { markSynced } from "@/lib/sync-status";
import { greetingName, reminderSubject, reminderText } from "@/lib/reminders";

/**
 * Owner emails (invoice / proposal / reminder). Everything here only builds text or records what the
 * owner chose to send; nothing sends on its own. Sending is the server route /api/email/send, called
 * only from the owner's explicit "Send email" click.
 */
export type EmailKind = "invoice" | "proposal" | "reminder";
export type EmailLogEntry = { sentAt: string; to: string; subject: string; kind: EmailKind; via: "email" | "mailto"; id?: string };

export type EmailInput = {
  kind: EmailKind;
  clientName: string;
  number: string;
  total: number;
  owed: number;
  dueDate: string;
  viewUrl: string; // approval or client portal link ("" if none)
  payUrl: string; // owner's own payment link ("" if none)
  businessName: string;
  ownerName: string;
  today: string;
  contactName?: string;
  clientCompany?: string;
};

const money = (value: number) => `$${value.toFixed(2)}`;


function dateText(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function emailSubject(input: EmailInput) {
  const from = input.businessName ? ` from ${input.businessName}` : "";
  if (input.kind === "proposal") return `Proposal ${input.number || ""}${from}`.replace(/\s+/g, " ").trim();
  if (input.kind === "reminder") return reminderSubject("friendly", { ...input, invoiceNumber: input.number });
  return `Invoice ${input.number || ""}${from}`.replace(/\s+/g, " ").trim();
}

export function emailBody(input: EmailInput) {
  const sign = `\n\n${[input.ownerName, input.businessName].filter(Boolean).join(", ") || "Thank you"}`;
  if (input.kind === "reminder") {
    return reminderText("friendly", { ...input, invoiceNumber: input.number, payUrl: input.payUrl || input.viewUrl });
  }
  if (input.kind === "proposal") {
    const view = input.viewUrl ? `\n\nYou can review, sign and approve it here:\n${input.viewUrl}` : "";
    return `Hi ${greetingName(input.clientName, input.contactName, input.clientCompany)},\n\nHere is proposal ${input.number || ""} for ${money(input.total)}.${view}\n\nLet me know if you have any questions.${sign}`.replace(/proposal  for/, "proposal for");
  }
  const owed = input.owed > 0.004 ? ` The balance is ${money(input.owed)}${input.dueDate ? `, due ${dateText(input.dueDate)}` : ""}.` : " It is paid in full. Thank you!";
  const view = input.viewUrl ? `\n\nView it online${input.owed > 0.004 ? " (and pay by card if offered)" : ""}:\n${input.viewUrl}` : "";
  const pay = input.payUrl && input.owed > 0.004 ? `\n\nPay here:\n${input.payUrl}` : "";
  return `Hi ${greetingName(input.clientName, input.contactName, input.clientCompany)},\n\nHere is invoice ${input.number || ""} for ${money(input.total)}.${owed}${view}${pay}${sign}`.replace(/invoice  for/, "invoice for");
}

export function validEmail(value: string) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value.trim());
}

/** Is server sending configured? (yes/no only) */
export async function emailSendingEnabled() {
  try {
    const response = await fetch("/api/email/status", { cache: "no-store" });
    if (!response.ok) return false;
    return Boolean((await response.json()).enabled);
  } catch {
    return false;
  }
}

/** Sends through the server provider. Only call from the owner's explicit Send click. */
export async function sendEmail(docId: string, to: string, subject: string, text: string): Promise<{ id: string; error: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { id: "", error: "Sign in to send email from the app, or use “Open in email app”." };
  // QA2: one request id per Send click; the automatic retry after a lost reply reuses it (no duplicate email).
  const requestId = crypto.randomUUID();
  const post = () => fetch("/api/email/send", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ docId, to, subject, text, requestId }),
  });
  try {
    const response = await post().catch(() => post());
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { id: "", error: String(result.error || "The email was not sent.") };
    return { id: String(result.id || ""), error: "" };
  } catch {
    return { id: "", error: "Could not reach the server. The email was not sent." };
  }
}

export function readEmailLog(value: unknown): EmailLogEntry[] {
  return Array.isArray(value) ? (value.filter((entry) => entry && typeof entry === "object" && (entry as EmailLogEntry).sentAt) as EmailLogEntry[]) : [];
}

/** History line for a draft the owner marked sent while emailing it. */
export function markedSentAction(via: EmailLogEntry["via"]) {
  return via === "mailto" ? "Marked sent (sent from email app)" : "Marked sent (emailed from ClientReady)";
}

/**
 * Adds one entry to the document's email log (data.emailLog). The status changes only when the owner
 * ticked "mark as sent" and the document is still a draft; that also appends a history entry. Money fields
 * are never touched. Same path for app sends and "Open in email app".
 *
 * Retest bug: the old version set status on a possibly stale local copy and went through the field merge,
 * which treats a stale copy's fields as "unchanged" so the cloud's "draft" won and Sent was dropped. Now the
 * change is applied to the cloud's current copy (cloud first, like approvals) and only these fields change.
 */
export async function logEmail(docId: string, entry: EmailLogEntry, markSent: boolean, byName = "") {
  const raw = window.localStorage.getItem("clientready-documents");
  const docs = raw ? (JSON.parse(raw) as CloudDoc[]) : [];
  const doc = docs.find((item) => item.id === docId);
  if (!doc) return null;
  const apply = (source: Record<string, unknown>, byId?: string) => {
    const data: Record<string, unknown> = { ...source };
    data.emailLog = [...readEmailLog(data.emailLog), entry];
    const markedSent = markSent && String(data.status || "draft") === "draft";
    if (markedSent) {
      data.status = "sent";
      const history = Array.isArray(data.history) ? data.history : [];
      data.history = [...history, { at: entry.sentAt, by: byName.trim() || "Owner", ...(byId ? { byId } : {}), action: markedSentAction(entry.via) }];
    }
    data.updatedAt = new Date().toISOString();
    return { data, markedSent };
  };
  const userId = isUuid(docId) ? await getUserId() : null;
  if (userId) {
    const { data: row, error } = await supabase.from("documents").select("data").eq("id", docId).eq("user_id", userId).maybeSingle();
    if (!error && row) {
      const result = apply((row.data as Record<string, unknown> | null) || {}, userId);
      const { error: writeError } = await supabase.from("documents").update({ data: result.data }).eq("id", docId).eq("user_id", userId);
      if (!writeError) {
        const next = { ...doc, data: result.data };
        const latestRaw = window.localStorage.getItem("clientready-documents");
        const latest = latestRaw ? (JSON.parse(latestRaw) as CloudDoc[]) : docs;
        window.localStorage.setItem("clientready-documents", JSON.stringify(latest.map((item) => (item.id === docId ? next : item))));
        writeBases([{ id: docId, data: result.data }]);
        markSynced(docId);
        return { log: result.data.emailLog as EmailLogEntry[], markedSent: result.markedSent, history: result.data.history };
      }
    }
  }
  // Offline / local-only: change the local copy and save it the normal way (uploaded later if unreachable).
  const result = apply((doc.data || {}) as Record<string, unknown>);
  const next = { ...doc, data: result.data };
  await saveCloudDocument(next);
  const latestRaw = window.localStorage.getItem("clientready-documents");
  const latest = latestRaw ? (JSON.parse(latestRaw) as CloudDoc[]) : docs;
  window.localStorage.setItem("clientready-documents", JSON.stringify(latest.map((item) => (item.id === docId ? next : item))));
  return { log: next.data.emailLog as EmailLogEntry[], markedSent: result.markedSent, history: next.data.history };
}
