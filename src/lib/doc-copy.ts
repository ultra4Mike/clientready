/**
 * R103: "Duplicate" makes a fresh draft. Only what describes the work and the client is copied;
 * payments, deposits, stages paid state, schedule/crew, status, approval link, email log, number,
 * recurring/change-order links and every stamp start over.
 */
const KEEP = ["clientName", "clientId", "clientCompany", "contactName", "clientEmail", "clientPhone", "clientAddress", "items", "taxPercent", "discountType", "discountValue", "notes", "terms", "noLateFee", "showPhotos", "style", "jobCosts", "depositPercent"] as const;

export function copyDocData(data: Record<string, unknown> | undefined, number: string, today: string, due: string) {
  const out: Record<string, unknown> = {};
  for (const key of KEEP) if (data && data[key] !== undefined) out[key] = data[key];
  return { ...out, invoiceNumber: number, invoiceDate: today, dueDate: due, status: "draft", payments: [], paymentAmount: "", paymentMethod: "", paymentDate: "", paymentRef: "" };
}
