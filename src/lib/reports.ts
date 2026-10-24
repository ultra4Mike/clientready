import { docAmounts } from "@/lib/doc-stage";
import { jobWhen } from "@/lib/job-when";
import { cashEntries } from "@/lib/money";
import { isBilledInvoice } from "@/lib/ledger";
import { readPayments, refundedTotal } from "@/lib/payments";
import { dedupeCopies } from "@/lib/doc-dedupe";
import { jobProfit, type ProfitLine } from "@/lib/job-profit";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
type CrewExpense = { amount?: unknown; created_at?: string };

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function money(value: unknown) {
  const n = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "2026-03-05" or a saved local date like "3/5/2026" -> { year, month 0-11 }, or null. */
/** The scheduled job day (YYYY-MM-DD) saved on the invoice, or "". */
function scheduledDay(data: Record<string, unknown>) {
  return jobWhen(data)?.date || "";
}

export function yearMonth(value: unknown): { year: string; month: number } | null {
  const text = String(value || "");
  const iso = text.match(/^(\d{4})-(\d{2})/);
  if (iso) return { year: iso[1], month: Number(iso[2]) - 1 };
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : { year: String(parsed.getFullYear()), month: parsed.getMonth() };
}

/** The owner's job cost, same formula as the invoice page: parts + gas + labor + tools + lunch + other fees. */
export function ownerJobCost(data: Record<string, unknown> = {}) {
  const costs = (data.jobCosts || {}) as Record<string, unknown>;
  const fees = Array.isArray(costs.otherFees) ? (costs.otherFees as { amount?: unknown }[]) : [];
  const otherTotal = fees.reduce((sum, fee) => sum + money(fee.amount), 0);
  return money(costs.parts) + money(costs.gas) + money(costs.labor) + money(costs.tools) + money(costs.lunch) + otherTotal;
}

export type MonthRow = { month: number; billed: number; collected: number; jobCosts: number; crewReceipts: number };
export type JobRow = { id: string; type: string; number: string; client: string; date: string; month: number; total: number; refunded: number; net: number; cost: number; profit: number; jobDate: string; lines: ProfitLine[] };

/**
 * One year by month. Billed: sent invoices by invoice date. Collected: payments by the date received.
 * Job costs: owner job costs by invoice date. Crew receipts: logged by crew (shown, not added to job
 * costs, as on the year packet). Jobs: each billed invoice's total minus its owner job cost.
 */
export function buildReport(allDocs: Doc[], crewExpenses: CrewExpense[], year: string) {
  const docs = dedupeCopies(allDocs); // R117: device + cloud copy of one number counts once
  const months: MonthRow[] = MONTHS.map((_, month) => ({ month, billed: 0, collected: 0, jobCosts: 0, crewReceipts: 0 }));
  const jobs: JobRow[] = [];
  for (const doc of docs) {
    // QA3: one billed rule (ledger): not draft, void, deleted, pending recurring or replaced by a revision.
    if (!isBilledInvoice(doc as never, docs as never)) continue;
    const data = doc.data || {};
    const { total } = docAmounts(doc);
    const when = yearMonth(data.invoiceDate || doc.createdAt);
    // R107: profit by job is filed under the job date (when it was done); billing stays on the invoice date.
    const jobDay = scheduledDay(data);
    const jobAt = yearMonth(jobDay || data.invoiceDate || doc.createdAt);
    const all = jobProfit({ total, data });
    if (jobAt?.year === year) jobs.push({ id: doc.id, type: doc.type, number: String(data.invoiceNumber || doc.title || "Invoice"), client: doc.clientName || "No client", date: jobDay || String(data.invoiceDate || doc.createdAt || ""), month: jobAt.month, total, refunded: refundedTotal(readPayments(data)), net: Math.round((total - refundedTotal(readPayments(data))) * 100) / 100, cost: all.cost, profit: all.profit, jobDate: jobDay, lines: all.lines });
    if (when?.year !== year) continue;
    months[when.month].billed += total;
    // R128: the same cost as Profit by job (owner costs + card fees + mileage), so the two agree; refunds lower collected, never costs.
    months[when.month].jobCosts += all.cost;
  }
  // R104: collected = the shared cash-basis entries (refunds, deposits, legacy paid), by payment date.
  for (const entry of cashEntries(docs)) {
    const when = yearMonth(entry.date);
    if (when?.year === year) months[when.month].collected += entry.amount;
  }
  for (const item of crewExpenses) {
    const when = yearMonth(item.created_at);
    if (when?.year === year) months[when.month].crewReceipts += money(item.amount);
  }
  const sum = (key: keyof Omit<MonthRow, "month">) => months.reduce((total, row) => total + row[key], 0);
  const totals = { billed: sum("billed"), collected: sum("collected"), jobCosts: sum("jobCosts"), crewReceipts: sum("crewReceipts"), profit: jobs.reduce((total, job) => total + job.profit, 0) };
  jobs.sort((a, b) => a.month - b.month || a.date.localeCompare(b.date));
  return { months, jobs, totals };
}

/** Years that have any invoice activity, newest first, always including the current year. */
export function reportYears(docs: Doc[]) {
  const years = new Set([String(new Date().getFullYear())]);
  for (const doc of docs) {
    if (doc.type !== "invoice") continue;
    const data = doc.data || {};
    for (const value of [data.invoiceDate, doc.createdAt, ...readPayments(data).map((payment) => payment.date)]) {
      const when = yearMonth(value);
      if (when && /^\d{4}$/.test(when.year)) years.add(when.year);
    }
  }
  return [...years].sort().reverse();
}
