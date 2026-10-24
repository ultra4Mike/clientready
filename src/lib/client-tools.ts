// QA3 client helpers: search (digits-only phone), tel links, duplicate detection, CSV export rows, edit log. Pure except the log.
export type ClientLike = {
  id: string; name?: string; company?: string; email?: string; phone?: string; address?: string; notes?: string; preferences?: string;
  nextVisit?: string; visitTime?: string; contactMethod?: string; reviewOptOut?: boolean; autoEmailOptOut?: boolean;
};

const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const norm = (value: unknown) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** tel: link with only digits and a leading + (same as the clients list). */
export function telHref(phone: unknown) {
  const raw = String(phone ?? "").trim();
  const d = digits(raw);
  return d ? `tel:${raw.startsWith("+") ? "+" : ""}${d}` : "";
}

/** Text match on any field, or a digits-only match on the phone ("5551234" finds "(555) 123-4"). */
export function clientMatches(client: ClientLike, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [client.name, client.company, client.email, client.phone, client.address, client.notes].map((v) => String(v ?? "")).join(" ").toLowerCase();
  if (hay.includes(q)) return true;
  const qd = digits(q);
  return qd.length >= 3 && qd.length === q.replace(/[\s().+-]/g, "").length && digits(client.phone).includes(qd);
}

export type DuplicateHit = { client: ClientLike; reasons: ("email" | "phone" | "name")[] };

/** Possible duplicates of a new/edited client: same email, same phone digits (7+), or same name. */
export function possibleDuplicates(form: Partial<ClientLike>, clients: ClientLike[], excludeId = ""): DuplicateHit[] {
  const email = String(form.email ?? "").trim().toLowerCase();
  const phone = digits(form.phone);
  const name = norm(form.name);
  const out: DuplicateHit[] = [];
  for (const client of clients) {
    if (!client || client.id === excludeId) continue;
    const reasons: DuplicateHit["reasons"] = [];
    if (email && String(client.email ?? "").trim().toLowerCase() === email) reasons.push("email");
    if (phone.length >= 7 && digits(client.phone).slice(-10) === phone.slice(-10)) reasons.push("phone");
    if (name && norm(client.name) === name) reasons.push("name");
    if (reasons.length) out.push({ client, reasons });
  }
  return out;
}

/** Simple merge: keep the first client's values, fill blanks from the other, and join both notes. */
export function mergeClients<T extends ClientLike>(keep: T, other: ClientLike): T {
  const pick = (a: unknown, b: unknown) => (String(a ?? "").trim() ? a : b);
  const notes = [keep.notes, other.notes].map((v) => String(v ?? "").trim()).filter(Boolean);
  return {
    ...keep,
    company: pick(keep.company, other.company) as string, email: pick(keep.email, other.email) as string, phone: pick(keep.phone, other.phone) as string,
    address: pick(keep.address, other.address) as string, nextVisit: pick(keep.nextVisit, other.nextVisit) as string, visitTime: pick(keep.visitTime, other.visitTime) as string,
    preferences: pick(keep.preferences, other.preferences) as string, contactMethod: pick(keep.contactMethod, other.contactMethod) as string,
    notes: [...new Set(notes)].join("\n"),
    reviewOptOut: Boolean(keep.reviewOptOut || other.reviewOptOut), autoEmailOptOut: Boolean(keep.autoEmailOptOut || other.autoEmailOptOut),
  };
}

export const CLIENT_EXPORT_HEADER = ["Name", "Company", "Email", "Phone", "Address", "Notes", "Preferences", "Next visit", "Visit time", "Preferred contact", "Review requests opt-out", "Auto email opt-out"];
export function clientExportRow(c: ClientLike) {
  return [c.name || "", c.company || "", c.email || "", c.phone || "", c.address || "", c.notes || "", c.preferences || "", c.nextVisit || "", c.visitTime || "", c.contactMethod || "", c.reviewOptOut ? "Yes" : "No", c.autoEmailOptOut ? "Yes" : "No"];
}

const LABELS: Record<string, string> = { name: "name", company: "company", email: "email", phone: "phone", address: "address", nextVisit: "next visit", visitTime: "visit time", notes: "notes", preferences: "preferences", contactMethod: "preferred contact", reviewOptOut: "review opt-out", autoEmailOptOut: "auto email opt-out" };
/** Which fields an edit changed, in plain words. */
export function clientChanges(before: Partial<ClientLike>, after: Partial<ClientLike>) {
  return Object.keys(LABELS).filter((key) => {
    const a = (before as Record<string, unknown>)[key], b = (after as Record<string, unknown>)[key];
    return typeof a === "boolean" || typeof b === "boolean" ? Boolean(a) !== Boolean(b) : String(a ?? "").trim() !== String(b ?? "").trim();
  }).map((key) => LABELS[key]);
}

export type ClientEdit = { clientId: string; at: string; fields: string[] };
const LOG_KEY = "clientready-client-edits";
export function readClientEdits(clientId: string, store: Pick<Storage, "getItem"> | undefined = typeof window !== "undefined" ? window.localStorage : undefined): ClientEdit[] {
  try { const list = JSON.parse(store?.getItem(LOG_KEY) || "[]"); return Array.isArray(list) ? list.filter((e: ClientEdit) => e?.clientId === clientId) : []; } catch { return []; }
}
export function logClientEdit(clientId: string, fields: string[], at = new Date().toISOString(), store: Pick<Storage, "getItem" | "setItem"> | undefined = typeof window !== "undefined" ? window.localStorage : undefined) {
  if (!store || !clientId || !fields.length) return;
  let list: ClientEdit[] = [];
  try { const parsed = JSON.parse(store.getItem(LOG_KEY) || "[]"); if (Array.isArray(parsed)) list = parsed; } catch { list = []; }
  list.push({ clientId, at, fields });
  store.setItem(LOG_KEY, JSON.stringify(list.slice(-500)));
}
