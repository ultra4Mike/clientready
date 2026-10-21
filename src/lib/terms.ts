/** Settings > payment terms text decides the default due date and notes for new invoices. */
export function termsDays(text: string): number {
  const t = String(text || "").toLowerCase();
  const m = /(?:within|in|net)\s*(\d{1,3})\s*(?:days?)?/.exec(t) || /(\d{1,3})\s*days?/.exec(t);
  if (m) return Math.min(365, Number(m[1]));
  if (/day of service|on receipt|upon receipt|due on completion|due today|same day|when (the )?job is done/.test(t)) return 0;
  return 14;
}

export function defaultInvoiceTerms(): { notes: string; days: number } {
  let text = "";
  try { text = String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").paymentTerms || ""); } catch { text = ""; }
  const notes = text.trim() || "Payment is due within 14 days.";
  return { notes, days: termsDays(notes) };
}
