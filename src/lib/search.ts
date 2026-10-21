// Global search over this device's cache (documents, clients, parts). Read-only; owner pages only.
export type SearchHit = { kind: "document" | "client" | "part"; id: string; title: string; detail: string; href: string; score: number };
type Doc = { id: string; type: string; title?: string; clientName?: string; data?: Record<string, unknown> };
type Client = { id: string; name?: string; company?: string; email?: string; phone?: string; address?: string; notes?: string };
type Part = { id: string; name?: string; deleted?: boolean };

const s = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
const norm = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const digits = (value: string) => value.replace(/\D/g, "");

/** Every word must match somewhere; title matches and prefix matches rank higher. Phone numbers match by digits. */
function score(query: string, title: string, fields: string[]) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const hay = norm([title, ...fields].join(" \u0001 "));
  const hayDigits = digits(fields.join(" "));
  let total = 0;
  for (const word of words) {
    const d = digits(word);
    if (hay.includes(word)) total += norm(title).startsWith(word) ? 5 : norm(title).includes(word) ? 3 : 1;
    else if (d.length >= 3 && d === word.replace(/[^\d]/g, "") && hayDigits.includes(d)) total += 2;
    else if (word.length >= 4 && /[a-z]/.test(word) && !/\d/.test(word) && hay.split(/[^a-z0-9]+/).some((token) => nearWord(word, token))) total += 1;
    else return 0;
  }
  return total;
}

/** R107 fuzzy: one typo (swap, extra, missing or wrong letter) against a word or its prefix. */
export function nearWord(word: string, token: string) {
  if (!token || Math.abs(token.length - word.length) > 1 && token.length < word.length) return false;
  const t = token.slice(0, word.length + 1);
  const a = word, b = t;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let best = Infinity;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i === a.length) best = Math.min(...cur.slice(Math.max(1, a.length - 1)));
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  if (a.length >= 2 && b.length >= 2) for (let i = 0; i < a.length - 1; i++) if (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(0, i) === b.slice(0, i) && b.startsWith(a.slice(0, i) + a[i + 1] + a[i])) best = Math.min(best, 1);
  return best <= 1;
}

function read<T>(key: string): T[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function searchAll(query: string, limit = 20): SearchHit[] {
  if (query.trim().length < 2) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const doc of read<Doc>("clientready-documents")) {
    if (!doc || seen.has(doc.id)) continue;
    seen.add(doc.id);
    const data = doc.data || {};
    const number = s(data.invoiceNumber) || s(doc.title);
    const items = Array.isArray(data.items) ? (data.items as { description?: unknown }[]).map((item) => s(item.description)) : [];
    const client = s(data.clientName) || s(doc.clientName);
    const n = score(query, `${number} ${client}`, [s(data.clientEmail), s(data.clientPhone), s(data.clientAddress), s(data.notes), ...items]);
    if (n) hits.push({ kind: "document", id: doc.id, title: `${doc.type === "proposal" ? "Proposal" : "Invoice"} ${number}`.trim(), detail: [client, s(data.status)].filter(Boolean).join(" · "), href: `/invoice?id=${encodeURIComponent(doc.id)}`, score: n });
  }
  for (const client of read<Client>("clientready-clients")) {
    if (!client?.id) continue;
    const n = score(query, s(client.name), [s(client.company), s(client.email), s(client.phone), s(client.address), s(client.notes)]);
    if (n) hits.push({ kind: "client", id: client.id, title: s(client.name), detail: [s(client.company), s(client.phone), s(client.email)].filter(Boolean).join(" · "), href: `/clients/${encodeURIComponent(client.id)}`, score: n + 1 });
  }
  for (const part of read<Part>("clientready-inventory")) {
    if (!part?.id || part.deleted) continue;
    const n = score(query, s(part.name), []);
    if (n) hits.push({ kind: "part", id: part.id, title: s(part.name), detail: "Inventory", href: "/inventory", score: n });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}
