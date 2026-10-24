import { readStages, stagePlan } from "./stages";
import { bizToday } from "./biz-today";
/** tip: extra the client gave on top of the bill; never counts toward the balance. */
export type Payment = { id: string; amount: string; method: string; date: string; ref: string; tip?: string; note?: string; of?: string };

/** QA4: methods the owner can pick by hand ("Card (Stripe)" is only set by a real Stripe payment). */
export const manualMethodsFrom = (all: string[]) => all.filter((m) => m !== "Card (Stripe)");
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
        ...(item.note ? { note: String(item.note).slice(0, 300) } : {}),
        ...(item.of ? { of: String(item.of) } : {}),
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

/** R95: a Stripe refund is saved as its own negative row (id "refund_..."), so it lowers what was paid. */
export const isRefundRow = (payment: { id?: unknown }) => String(payment.id || "").startsWith("refund_");

/** R126: money in before refunds (positive rows only). */
export function grossPaid(payments: Payment[]) {
  return round(payments.reduce((sum, payment) => sum + (isRefundRow(payment) ? 0 : Math.max(num(payment.amount), 0)), 0));
}
export function refundedTotal(payments: Payment[]) {
  return round(payments.reduce((sum, payment) => sum + (isRefundRow(payment) ? Math.max(-num(payment.amount), 0) : 0), 0));
}
/** R126: "refunded" / "partially_refunded" when an invoice was paid in full and then refunded; "" otherwise. */
export function refundState(total: number, payments: Payment[]): "" | "refunded" | "partially_refunded" {
  const refunded = refundedTotal(payments);
  if (refunded <= 0.004 || total <= 0 || grossPaid(payments) < total - 0.004) return "";
  return paidTotal(payments) <= 0.004 ? "refunded" : "partially_refunded";
}
/**
 * Help retest: ONE refund wording for the owner and the client page. Paid in full then refunded:
 * "Refunded $X" (all of it back) or "Partially refunded $X". Any other refund (e.g. a deposit given
 * back before the job is paid): "Refunded $X" shown beside the normal status. "" when no refund.
 */
export function refundWording(total: number, payments: Payment[]) {
  const refunded = refundedTotal(payments);
  if (refunded <= 0.004) return "";
  return `${refundState(total, payments) === "partially_refunded" ? "Partially refunded" : "Refunded"} $${refunded.toFixed(2)}`;
}
export const isVoidStatus = (status: unknown) => ["void", "voided", "deleted"].includes(String(status || ""));
/**
 * R126: what is owed, refund-aware. A void invoice owes nothing. A refund on a paid-in-full invoice does
 * not reopen a balance unless the owner chose to re-bill it (data.rebillRefund).
 */
export function owedAfterRefunds(total: number, payments: Payment[], status?: unknown, rebill?: unknown) {
  if (isVoidStatus(status)) return 0;
  if (!rebill && refundState(total, payments)) return balanceDue(total, grossPaid(payments), status);
  return balanceDue(total, paidTotal(payments), status);
}

export function paidTotal(payments: Payment[]) {
  return round(Math.max(payments.reduce((sum, payment) => sum + (isRefundRow(payment) ? Math.min(num(payment.amount), 0) : Math.max(num(payment.amount), 0)), 0), 0));
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
  const clean = payments.filter((payment) => num(payment.amount) > 0 || (isRefundRow(payment) && num(payment.amount) < 0)).map(({ tip, ...payment }) => (num(tip) > 0 ? { ...payment, tip } : payment));
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
  // R2: server-recorded refunds ("refund_...") are kept too, so a stale device save can't drop a refund.
  const remote = readPayments(cloud).filter((payment) => payment.id.startsWith("stripe_") || isRefundRow(payment));
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
  // Overdue fix: void never goes overdue (it owes nothing), same as draft and paid.
  if (s === "draft" || s === "paid" || s === "void" || s === "voided" || !(owed > 0.004)) return false;
  const due = String(dueDate || "").slice(0, 10);
  const hasDue = /^\d{4}-\d{2}-\d{2}$/.test(due);
  // Only a passed due date counts; a manual "overdue" with no or a future due date does not.
  return hasDue && due < today;
}

/**
 * Overdue v2: the header due date when an invoice has a payment plan = the last dated stage (the plan's final date).
 * Without a plan (or no dated stage) it's the invoice's own Due date. Use this wherever a due date is shown or compared.
 */
export function effectiveDueDate(data: Record<string, unknown> | undefined) {
  const d = data || {};
  const dates = readStages(d.stages).map((s) => s.dueDate.slice(0, 10)).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v)).sort();
  return dates.length ? dates[dates.length - 1] : String(d.dueDate || "").slice(0, 10);
}

/** Overdue v2: the date the next unpaid payment is due (a plan's first unpaid stage), else the effective due date. */
export function nextDueDate(data: Record<string, unknown> | undefined, total: number, owed: number, today = localToday()) {
  const d = data || {};
  const stages = readStages(d.stages);
  const row = stages.length ? stagePlan(total, owed, stages, today).rows.find((r) => r.state !== "paid" && r.dueDate) : null;
  return row ? row.dueDate.slice(0, 10) : effectiveDueDate(d);
}

/**
 * isPastDue for a whole invoice. Overdue v2: with a payment plan (data.stages) the stages decide. It is overdue only
 * when an unpaid or partly paid stage's due date has passed (business-timezone today). The invoice-level Due date is
 * ignored then (it's kept in sync with the last stage), so an old header date can't keep a plan invoice "Overdue".
 */
export function invoicePastDue(data: Record<string, unknown> | undefined, total: number, owed: number, today = localToday()) {
  const d = data || {};
  const stages = readStages(d.stages);
  if (!stages.length) return isPastDue(d.status, d.dueDate, owed, today);
  const s = String(d.status || "draft");
  if (s === "draft" || s === "paid" || s === "void" || s === "voided" || !(owed > 0.004)) return false;
  return stagePlan(total, owed, stages, today).rows.some((row) => row.state === "overdue");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(ymd: string) {
  const [, m, day] = ymd.split("-").map(Number);
  return m && day ? `${MONTHS[m - 1]} ${day}` : ymd;
}

/** Why invoicePastDue says overdue, in plain words (or "" when it isn't). With a plan it names the stage. */
export function overdueReason(data: Record<string, unknown> | undefined, total: number, owed: number, today = localToday()) {
  const d = data || {};
  if (!invoicePastDue(d, total, owed, today)) return "";
  const stages = readStages(d.stages);
  if (!stages.length) return `Due date ${String(d.dueDate).slice(0, 10)} has passed`;
  const row = stagePlan(total, owed, stages, today).rows.find((r) => r.state === "overdue");
  return row ? `${row.label || "A payment"} $${row.remaining.toFixed(2)} was due ${shortDate(row.dueDate)}` : "";
}

function localToday() {
  return bizToday();
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

/**
 * R2: how much of one payment can still be refunded: its amount minus refunds linked to it ("of"), or, for a
 * card payment, Stripe refunds recorded against the same PaymentIntent (ref). Never more than the net paid.
 */
export function refundableFor(payments: Payment[], paymentId: string) {
  const row = payments.find((payment) => payment.id === paymentId && !isRefundRow(payment));
  if (!row || num(row.amount) <= 0) return 0;
  const linked = payments.filter((payment) => isRefundRow(payment) && (payment.of === paymentId || (!payment.of && row.ref.startsWith("pi_") && payment.ref === row.ref)));
  const left = num(row.amount) + linked.reduce((sum, payment) => sum + Math.min(num(payment.amount), 0), 0);
  const net = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  return round(Math.max(Math.min(left, net), 0));
}
/** R2: a card payment taken through Stripe (refund goes back to the card through Stripe). */
export const isStripeCardPayment = (payment: Payment) => payment.id.startsWith("stripe_") && payment.ref.startsWith("pi_");

export const manualPaymentMethods = manualMethodsFrom(paymentMethods);
