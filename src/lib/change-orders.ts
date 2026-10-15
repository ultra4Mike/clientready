export type ChangeOrderOf = { id: string; number: string };

type Doc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

export function readChangeOrderOf(value: unknown): ChangeOrderOf | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ChangeOrderOf>;
  if (!raw.id) return null;
  return { id: String(raw.id), number: String(raw.number || "") };
}

/** Change orders that point at this document. Derived by search, so the original is never modified. */
export function changeOrdersFor(docs: Doc[], originalId: string) {
  return docs
    .filter((doc) => doc.type === "invoice" && readChangeOrderOf(doc.data?.changeOrderOf)?.id === originalId)
    .map((doc) => ({ id: doc.id, number: String(doc.data?.invoiceNumber || doc.title), title: doc.title }));
}

/**
 * Builds the data for a new change-order invoice from a saved invoice's data.
 * Copies client, items (with labor/materials tags), discount, tax, notes, pay link and style.
 * Leaves out payments, signatures, photos and owner job costs/crew: the change order is a
 * fresh document that needs its own payment and sign-off, and its own costs.
 */
export function changeOrderData(original: Doc, newNumber: string, today: string, due: string) {
  const data = { ...(original.data || {}) };
  for (const key of ["payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef", "signature", "proposalSignature", "photos", "jobCosts", "crew", "recurring", "recurringFrom", "recurringReview", "changeOrderNotes", "updatedAt"]) {
    delete data[key];
  }
  return {
    ...data,
    invoiceNumber: newNumber,
    invoiceDate: today,
    dueDate: due,
    status: "draft",
    changeOrderOf: { id: original.id, number: String(original.data?.invoiceNumber || original.title) },
  };
}

export type ChangeOrderNote = { id: string; number: string; createdAt: string };

export function readChangeOrderNotes(value: unknown): ChangeOrderNote[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note) => note && typeof note === "object" && (note as ChangeOrderNote).id)
    .map((note) => ({ id: String(note.id), number: String(note.number || ""), createdAt: String(note.createdAt || "") }));
}

/** Union of two note lists by id, keeping the first one seen. Notes are append-only. */
export function mergeChangeOrderNotes(...lists: ChangeOrderNote[][]) {
  const seen = new Map<string, ChangeOrderNote>();
  for (const list of lists) for (const note of list) if (!seen.has(note.id)) seen.set(note.id, note);
  return [...seen.values()];
}

/** Every field that affects money, status or payment on a document. */
const MONEY_KEYS = [
  "items", "discountType", "discountValue", "discountAmount", "taxPercent", "status",
  "payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef", "jobCosts", "crew",
];

export function moneySnapshot(data: Record<string, unknown> | undefined) {
  const snap: Record<string, unknown> = {};
  for (const key of MONEY_KEYS) snap[key] = data?.[key];
  return JSON.stringify(snap);
}

/**
 * Appends a change-order note to the stored original and nothing else.
 * Returns the updated documents list and the updated original. Throws if any money field would change.
 */
export function appendChangeOrderNote<T extends Doc>(docs: T[], originalId: string, note: ChangeOrderNote) {
  const index = docs.findIndex((doc) => doc.id === originalId);
  if (index < 0) return null;
  const original = docs[index];
  const before = moneySnapshot(original.data);
  const notes = mergeChangeOrderNotes(readChangeOrderNotes(original.data?.changeOrderNotes), [note]);
  const updated = { ...original, data: { ...(original.data || {}), changeOrderNotes: notes } } as T;
  if (moneySnapshot(updated.data) !== before) throw new Error("Change order note would change money fields on the original");
  const next = [...docs];
  next[index] = updated;
  return { docs: next, original: updated };
}

/** Keeps one document per id (the last one stored wins), so totals never count a document twice. */
export function uniqueDocs<T extends { id: string }>(docs: T[]) {
  const byId = new Map<string, T>();
  for (const doc of docs) byId.set(doc.id, doc);
  return [...byId.values()];
}

export function noteDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
