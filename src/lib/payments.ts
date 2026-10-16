/** tip: extra the client gave on top of the bill; never counts toward the balance. */
export type Payment = { id: string; amount: string; method: string; date: string; ref: string; tip?: string };

export const paymentMethods = ["Cash", "Check", "Venmo", "Cash App", "Zelle", "Bank", "Card", "Other"];

type PaymentData = {
  payments?: unknown;
  paymentAmount?: unknown;
  paymentMethod?: unknown;
  paymentDate?: unknown;
  paymentRef?: unknown;
  status?: unknown;
};

function num(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Payments saved on a document. Older docs that only have the single paymentAmount field become one payment. */
export function readPayments(data?: PaymentData | null): Payment[] {
  if (!data) return [];
  if (Array.isArray(data.payments)) {
    return data.payments.map((raw, index) => {
      const item = (raw || {}) as Partial<Payment>;
      return {
        id: String(item.id || `p${index}`),
        amount: String(item.amount ?? ""),
        method: String(item.method || ""),
        date: String(item.date || ""),
        ref: String(item.ref || ""),
        ...(num(item.tip) > 0 ? { tip: String(item.tip) } : {}),
      };
    });
  }
  if (num(data.paymentAmount) > 0) {
    return [{ id: "legacy", amount: String(data.paymentAmount), method: String(data.paymentMethod || ""), date: String(data.paymentDate || ""), ref: String(data.paymentRef || "") }];
  }
  return [];
}

/** Tips recorded with payments (separate from the invoice total and balance). */
export function tipTotal(payments: Payment[]) {
  return round(payments.reduce((sum, payment) => sum + Math.max(num(payment.tip), 0), 0));
}

export function paidTotal(payments: Payment[]) {
  return round(payments.reduce((sum, payment) => sum + Math.max(num(payment.amount), 0), 0));
}

/**
 * What is still owed: total minus payments, never below 0.
 * "Marked paid" only counts as fully paid for older invoices that have no payment amounts recorded;
 * once payments exist, the real math wins.
 */
export function balanceDue(total: number, amountPaid: number, status?: unknown) {
  if (status === "paid" && amountPaid <= 0) return 0;
  return round(Math.max(total - amountPaid, 0));
}

/** Fields to save in document data. Keeps the older single-payment fields filled for pages that read them. */
export function paymentFields(payments: Payment[]) {
  const clean = payments.filter((payment) => num(payment.amount) > 0).map(({ tip, ...payment }) => (num(tip) > 0 ? { ...payment, tip } : payment));
  const latest = clean[clean.length - 1];
  return {
    payments: clean,
    paymentAmount: clean.length ? paidTotal(clean).toFixed(2) : "",
    paymentMethod: latest?.method || "",
    paymentDate: latest?.date || "",
    paymentRef: latest?.ref || "",
  };
}

/**
 * Payments recorded by Stripe live in the cloud copy first. When a local copy (possibly older) is
 * saved or merged, keep any Stripe payments it doesn't have yet, so they are never dropped.
 */
export function keepStripePayments(local: Record<string, unknown>, cloud: Record<string, unknown> | null | undefined) {
  if (!cloud) return local;
  const remote = readPayments(cloud).filter((payment) => payment.id.startsWith("stripe_"));
  if (!remote.length) return local;
  const mine = readPayments(local);
  const missing = remote.filter((payment) => !mine.some((item) => item.id === payment.id));
  if (!missing.length) return local;
  return { ...local, ...paymentFields([...mine, ...missing]) };
}

/**
 * Money to collect: a sent (non-draft) invoice with more than $0 still owed. Drafts, including
 * recurring drafts awaiting review, were never sent, so Collect, the dashboard's Outstanding card,
 * the Documents "Outstanding" filter and Needs review all leave them out.
 */
export function isOpenBalance(status: unknown, owed: number) {
  return String(status || "draft") !== "draft" && owed > 0.004;
}
