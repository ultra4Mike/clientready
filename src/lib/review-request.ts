// Review request after payment: a ready-made message the owner opens in their own text/email app. Never sent automatically.

export function reviewMessage(clientName: string, businessName: string, link: string) {
  const first = clientName.trim().split(/\s+/)[0] || "there";
  const biz = businessName.trim() && businessName !== "Your business" ? businessName.trim() : "us";
  return `Hi ${first}, thank you for your payment and for choosing ${biz}! If you were happy with the work, would you leave us a quick review? ${link.trim()}`;
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

/** When this device last opened a review request for a document (ISO), or "". */
export function reviewAskedAt(docId: string): string {
  try {
    return (JSON.parse(window.localStorage.getItem(ASKED_KEY) || "{}") || {})[docId] || "";
  } catch {
    return "";
  }
}

export function noteReviewAsked(docId: string) {
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(window.localStorage.getItem(ASKED_KEY) || "{}") || {};
  } catch {
    all = {};
  }
  all[docId] = new Date().toISOString();
  window.localStorage.setItem(ASKED_KEY, JSON.stringify(all));
  return all[docId];
}
