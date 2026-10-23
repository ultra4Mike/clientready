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
  for (const key of ["payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef", "signature", "proposalSignature", "photos", "jobCosts", "crew", "recurring", "recurringFrom", "recurringReview", "approval", "schedule", "jobTime", "changeOrderNotes", "fromProposal", "reviews", "stages", "updatedAt", "emailLog", "crewReport", "noLateFee", "jobStart", "jobEnd", "stockUsed", "depositPercent", "renumberedFrom", "items"]) {
    delete data[key];
  }
  return {
    ...data,
    invoiceNumber: newNumber,
    invoiceDate: today,
    dueDate: due,
    status: "draft",
    // R87: a change order is only the extra work (a delta), linked to the original, never a second calendar job.
    items: [{ description: `Change to ${String(original.data?.invoiceNumber || original.title)}: `, qty: "1", rate: "", category: "" }],
    changeOrderOf: { id: original.id, number: String(original.data?.invoiceNumber || original.title) },
  };
}

/**
 * Fields a revision never copies from the version it revises (owner rule: everything else carries over and
 * the owner edits only what changed). Signatures/approval are per version (the customer re-approves);
 * number/status/dates-sent are the new document's own; payments stay where they were made and show as credits.
 * Owner job costs, stock used, clock/hours approvals and the crew's report are recorded work on that version:
 * copying them would count labor, materials and inventory twice.
 */
export const REVISION_NOT_COPIED = [
  "signature", "proposalSignature", "approval", "invoiceNumber", "status", "invoiceDate",
  "emailLog", "sentAt", "viewedAt", "firstViewedAt", "lastViewedAt", "viewCount", "updatedAt", "deleted",
  "payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef",
  "changeOrderNotes", "renumberedFrom", "reviews", "jobCosts", "stockUsed", "crewReport", "crewUndo", "hoursApprovals",
] as const;

/** Crew row fields that are logged work/pay on the old version (they stay there; the copy is the assignment). */
const CREW_WORK_FIELDS = ["hours", "bonus", "paidToWorker", "paidDate", "hoursFromClock", "clockMinutes", "payOverride"];

export function revisionCrewRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...row };
  for (const key of CREW_WORK_FIELDS) delete out[key];
  return { ...out, hours: "", bonus: "", paidToWorker: false, paidDate: "" };
}

/**
 * Option A: a revised-version change order. Copies EVERYTHING on the latest version of the chain (the original
 * or the newest sent revision): client and contact, address, notes, terms, tax, discount, deposit and payment
 * stages, photos, checklists, job/task rates, tags, custom fields, recurring settings, the crew and the schedule
 * (date, times, multi-day / per-day crew rows), except REVISION_NOT_COPIED. Lines remember where they came from
 * (fromVersion) so the editor can say "From INV-x" vs "Added". The job is never double-booked: until the revision
 * is sent the original holds it (holdsSchedule); once sent it moves to the revision.
 */
export function revisionData(root: Doc, latest: Doc, newNumber: string, today: string, due: string, latestTotal: number) {
  const data: Record<string, unknown> = JSON.parse(JSON.stringify(latest.data || {}));
  for (const key of REVISION_NOT_COPIED) delete data[key];
  const latestNumber = String(latest.data?.invoiceNumber || latest.title);
  const items = (Array.isArray(latest.data?.items) ? latest.data.items : []) as Record<string, unknown>[];
  const crew = (Array.isArray(data.crew) ? data.crew : []) as Record<string, unknown>[];
  return {
    ...data,
    invoiceNumber: newNumber,
    invoiceDate: today,
    dueDate: String(latest.data?.dueDate || "") || due,
    status: "draft",
    items: items.map((item) => ({ ...item, fromVersion: String(item.fromVersion || latestNumber) })),
    ...(Array.isArray(data.crew) ? { crew: crew.map(revisionCrewRow) } : {}),
    coMode: "revision",
    revises: { id: latest.id, number: latestNumber, total: latestTotal },
    changeOrderOf: { id: root.id, number: String(root.data?.invoiceNumber || root.title) },
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
