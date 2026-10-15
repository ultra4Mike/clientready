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
