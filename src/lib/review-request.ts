// Review request after payment: a ready-made message the owner opens in their own text/email app. Never sent automatically.

import { greetingName } from "./reminders";

export function reviewMessage(clientName: string, businessName: string, link: string, paid = true) {
  const first = greetingName(clientName); // R119: same greeting rule as reminders (no "Hi QA" for a business)
  const biz = businessName.trim() && businessName !== "Your business" ? businessName.trim() : "us";
  // R32: only thank them for a payment when the invoice is paid.
  return `Hi ${first}, thank you ${paid ? "for your payment and " : ""}for choosing ${biz}! If you were happy with the work, would you leave us a quick review? ${link.trim()}`;
}

export function reviewSmsHref(phone: string, body: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `sms:${digits}?&body=${encodeURIComponent(body)}` : "";
}

export function reviewMailHref(email: string, businessName: string, body: string) {
  if (!email.trim()) return "";
  const biz = businessName.trim() && businessName !== "Your business" ? businessName.trim() : "us";
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`Thanks for choosing ${biz}`)}&body=${encodeURIComponent(body)}`;
}

const ASKED_KEY = "clientready-review-asked";

type LocalDoc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
function readDocs(): LocalDoc[] {
  try { const list = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"); return Array.isArray(list) ? list : []; } catch { return []; }
}

/** When a review request was opened for this job (ISO), or "". R32: stored on the job (synced), older device-only marks still count. */
export function reviewAskedAt(docId: string): string {
  const onJob = readDocs().find((doc) => doc.id === docId)?.data?.reviewAskedAt;
  if (typeof onJob === "string" && onJob) return onJob;
  try {
    return (JSON.parse(window.localStorage.getItem(ASKED_KEY) || "{}") || {})[docId] || "";
  } catch {
    return "";
  }
}

/** Marks the job as asked (on the job itself, then saved to the account in the background). */
export function noteReviewAsked(docId: string) {
  const at = new Date().toISOString();
  const docs = readDocs();
  const doc = docs.find((item) => item.id === docId);
  if (doc) {
    doc.data = { ...(doc.data || {}), reviewAskedAt: at };
    window.localStorage.setItem("clientready-documents", JSON.stringify(docs));
    void import("@/lib/cloud-docs").then(({ saveCloudDocument }) => saveCloudDocument(doc as never)).catch(() => {});
  }
  return at;
}

/** R32: the client asked not to get review requests (Clients > Don't ask this client for reviews). */
export function clientOptedOut(clientId: string, clientName: string) {
  try {
    const list = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]") as { id?: string; name?: string; reviewOptOut?: boolean }[];
    const name = clientName.trim().toLowerCase();
    return list.some((client) => client.reviewOptOut && ((clientId && client.id === clientId) || (!clientId && name && String(client.name || "").trim().toLowerCase() === name)));
  } catch {
    return false;
  }
}
