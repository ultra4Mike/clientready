/** Returns the link only if it is a valid http(s) URL; anything else (Venmo handles, plain text, javascript:) is "". */
export function safePayUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

/** The invoice's own pay link wins; otherwise the business profile link. */
export function payUrlFor(docPayLink: unknown, profilePayLink: unknown) {
  return safePayUrl(docPayLink) || safePayUrl(profilePayLink);
}

/**
 * Invoice QR target: the customer invoice page (https://clientreadyapp.com/approve?t=…, which shows the
 * balance and every way to pay) when the invoice has a customer link; otherwise the external pay link.
 * `origin` is linkOrigin() (NEXT_PUBLIC_SITE_URL, default https://clientreadyapp.com in production).
 */
export function invoiceQrUrl(approvalToken: unknown, origin: string, docPayLink: unknown, profilePayLink: unknown) {
  const token = String(approvalToken ?? "").trim();
  if (token && /^[A-Za-z0-9_-]{20,}$/.test(token)) return safePayUrl(`${origin.replace(/\/+$/, "")}/approve?t=${encodeURIComponent(token)}`);
  return payUrlFor(docPayLink, profilePayLink);
}
