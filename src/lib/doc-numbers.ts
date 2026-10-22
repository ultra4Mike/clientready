/** R101: duplicate invoice/proposal numbers inside one account (pure). */
type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
const numberOf = (doc: Doc) => String(doc.data?.invoiceNumber || "").trim();
const QA = /\b(qa|test|demo|sample)\b/i;

export function duplicateGroups<T extends Doc>(docs: T[]) {
  const groups = new Map<string, T[]>();
  for (const doc of docs) {
    if ((doc.type !== "invoice" && doc.type !== "proposal") || !numberOf(doc) || doc.data?.deleted) continue;
    const key = `${doc.type}|${numberOf(doc)}`;
    groups.set(key, [...(groups.get(key) || []), doc]);
  }
  return [...groups.values()].filter((list) => list.length > 1).map((list) => ({ number: numberOf(list[0]), type: list[0].type, docs: list, suggest: suggestRenumber(list) }));
}

const sent = (doc: Doc) => !["", "draft"].includes(String(doc.data?.status || "draft"));
const stamp = (doc: Doc) => Date.parse(String(doc.data?.updatedAt || "")) || Date.parse(String(doc.createdAt || "")) || 0;

/** Which copy to give a new number: a QA/test one, else an unsent one, else the newest. Never decided silently. */
export function suggestRenumber<T extends Doc>(list: T[]): T {
  const qa = list.find((doc) => QA.test(`${doc.clientName || ""} ${doc.title || ""} ${String(doc.data?.clientName || "")}`));
  if (qa) return qa;
  const unsent = list.filter((doc) => !sent(doc));
  if (unsent.length && unsent.length < list.length) return unsent.sort((a, b) => stamp(b) - stamp(a))[0];
  return [...list].sort((a, b) => stamp(b) - stamp(a))[0];
}

/** Next free number with the same prefix ("INV-" -> INV-<max+1>). */
export function nextFreeNumber(docs: Doc[], type: string, like: string) {
  const own = type === "proposal" ? "PROP-" : "INV-";
  const liked = like.match(/^(.*?)\d+\s*$/)?.[1] || "";
  // Help live check: never carry the other type's prefix (a proposal copied from INV-1021 must not get INV-1022).
  const prefix = !liked || (type === "proposal" ? /^INV-?$/i : /^PROP-?$/i).test(liked) ? own : liked;
  let max = 1000;
  for (const doc of docs) {
    if (doc.type !== type) continue;
    const m = numberOf(doc).match(/^(.*?)(\d+)\s*$/);
    if (m && m[1] === prefix && Number(m[2]) > max) max = Number(m[2]);
  }
  return `${prefix}${max + 1}`;
}

export const isSentDoc = sent;

/**
 * Help live check (INV-1022 on a draft proposal): the number prefix must match the document type.
 * An unsent doc whose number has the other type's prefix (INV- on a proposal, PROP- on an invoice)
 * gets the next free number of its own type; anything else (sent docs, custom prefixes) is kept.
 */
export function numberForKind(docs: Doc[], type: string, current: string, status: string, selfId = "") {
  const value = String(current || "").trim();
  const wrong = type === "proposal" ? /^INV-?\d+$/i : /^PROP-?\d+$/i;
  if (!wrong.test(value) || !["", "draft"].includes(status)) return value;
  return nextFreeNumber(docs.filter((doc) => doc.id !== selfId), type, type === "proposal" ? "PROP-1000" : "INV-1000");
}
