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
  for (const key of ["payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef", "signature", "proposalSignature", "photos", "jobCosts", "crew"]) {
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
