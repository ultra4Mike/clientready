import { readStages, stagePlan } from "./stages";
/** tip: extra the client gave on top of the bill; never counts toward the balance. */
export type Payment = { id: string; amount: string; method: string; date: string; ref: string; tip?: string };

export const paymentMethods = ["Cash", "Check", "Venmo", "Cash App", "Zelle", "PayPal", "Bank", "Card", "Card (Stripe)", "Other"];

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
/**
 * Overdue without any manual status change: a sent (non-draft, not marked paid) invoice with money still owed
 * and a due date before today. Job done status does not matter. A manual "overdue" status with a balance also counts.
 */
export function isPastDue(status: unknown, dueDate: unknown, owed: number, today = localToday()) {
  const s = String(status || "draft");
  if (s === "draft" || s === "paid" || !(owed > 0.004)) return false;
  const due = String(dueDate || "").slice(0, 10);
  const hasDue = /^\d{4}-\d{2}-\d{2}$/.test(due);
  // Only a passed due date counts; a manual "overdue" with no or a future due date does not.
  return hasDue && due < today;
}

/**
 * isPastDue for a whole invoice. With a payment plan / stages (data.stages), each installment is judged on its
 * own due date (an unpaid installment's date has passed), and the invoice due date passing with money owed also counts (R86).
 */
export function invoicePastDue(data: Record<string, unknown> | undefined, total: number, owed: number, today = localToday()) {
  const d = data || {};
  const stages = readStages(d.stages);
  if (!stages.length) return isPastDue(d.status, d.dueDate, owed, today);
  const s = String(d.status || "draft");
  if (s === "draft" || s === "paid" || !(owed > 0.004)) return false;
  // R86: the invoice's own due date still counts — past it with money owed is overdue, stages or not.
  if (isPastDue(s, d.dueDate, owed, today)) return true;
  return stagePlan(total, owed, stages, today).rows.some((row) => row.state === "overdue");
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOpenBalance(status: unknown, owed: number) {
  return String(status || "draft") !== "draft" && owed > 0.004;
}

/**
 * Required payment details. Returns "" when the invoice can be saved, else the message to show.
 * - Any payment row with an amount needs a method (Paid with).
 * - Status Paid needs at least one payment with an amount and a method, except an invoice that was already
 *   saved as Paid before methods were required (legacyPaid): it keeps saving as is (Help R29).
 */
/** Display names matching the Settings picker; stored values stay as they are (backward compatible). */
export const METHOD_LABEL: Record<string, string> = { Bank: "Bank transfer (ACH)", Card: "Credit/debit card", "Card (Stripe)": "Card (Stripe)" };
export const methodLabel = (method: unknown) => METHOD_LABEL[String(method || "")] || String(method || "");

export function paymentRequirement(status: unknown, payments: Payment[], legacyPaid = false, saved: Payment[] = []) {
  // R56: same parser as the paid total ("$1,200.00" counts), so a row with an amount always needs a method.
  const amountNum = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const withAmount = payments.filter((payment) => amountNum(payment.amount) > 0);
  // Rows already saved without a method (older invoices, the server's legacy card row) are left alone unless edited (Help R30).
  const untouched = (payment: Payment) => saved.some((old) => Boolean(old.id) && old.id === payment.id && String(old.amount) === String(payment.amount) && !String(old.method || "").trim());
  if (withAmount.some((payment) => !String(payment.method || "").trim() && !untouched(payment))) return "Choose how each payment was made (Method) before saving.";
  if (String(status) === "paid" && !legacyPaid && !withAmount.length) return "To mark this invoice Paid, add a payment with the amount and how it was paid, or use Mark paid.";
  return "";
}
