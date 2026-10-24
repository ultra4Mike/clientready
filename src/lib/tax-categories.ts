import { readPayments, tipTotal } from "@/lib/payments";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { uniqueDocs } from "@/lib/change-orders";
import { yearMonth } from "@/lib/reports";
import { isCostedJob } from "@/lib/ledger";
import { jobLabour } from "@/lib/job-profit";

/**
 * Read-only mapping of the owner's job-cost fields to IRS Schedule C lines, for the year's totals.
 * Uses the same invoices and dates as Reports (sent invoices by invoice date) and the same fields as
 * ownerJobCost, so the lines add up to the Reports "Job costs" total. Nothing is changed or filed.
 */
type Doc = { id: string; type: string; createdAt?: string; data?: Record<string, unknown> };
type Fee = { name?: unknown; amount?: unknown };

export type TaxLine = { key: string; line: string; label: string; amount: number; note?: string };

export const TAX_LINES: Omit<TaxLine, "amount">[] = [
  { key: "car", line: "Line 9", label: "Car and truck expenses (gas / diesel)", note: "If you use the standard mileage rate instead, use your mileage log and leave gas out." },
  { key: "labor", line: "Line 11", label: "Contract labor (crew labor cost)", note: "Use Line 26 Wages instead for people on payroll." },
  { key: "supplies", line: "Line 22", label: "Supplies (parts + job supplies)", note: "Materials you resell may belong in cost of goods sold (Part III)." },
  { key: "meals", line: "Line 24b", label: "Meals (lunch)", note: "Usually only 50% is deductible." },
  { key: "other", line: "Line 27a", label: "Other expenses (other fees, dump fees)" },
];

const money = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number) => Math.round(n * 100) / 100;

export function taxCategories(allDocs: Doc[], year: string) {
  const sums: Record<string, number> = { car: 0, labor: 0, supplies: 0, meals: 0, other: 0 };
  let tips = 0;
  for (const doc of uniqueDocs(allDocs)) {
    if (doc.type !== "invoice" || isPendingRecurringDraft(doc)) continue;
    const data = doc.data || {};
    for (const payment of readPayments(data)) {
      if (yearMonth(payment.date || data.invoiceDate || doc.createdAt)?.year === year) tips += tipTotal([payment]);
    }
    // QA4: costs follow the job-costs set (every real job, as Overview / Profit by job), so Line 11 = job labour.
    if (!isCostedJob(doc as never, allDocs as never)) continue;
    if (yearMonth(data.invoiceDate || doc.createdAt)?.year !== year) continue;
    const costs = (data.jobCosts || {}) as Record<string, unknown>;
    const fees = Array.isArray(costs.otherFees) ? (costs.otherFees as Fee[]) : [];
    sums.car += money(costs.gas);
    sums.labor += jobLabour(data);
    sums.supplies += money(costs.parts) + money(costs.tools);
    sums.meals += money(costs.lunch);
    sums.other += fees.reduce((sum, fee) => sum + money(fee.amount), 0);
  }
  const lines: TaxLine[] = TAX_LINES.map((line) => ({ ...line, amount: round(sums[line.key]) }));
  return { lines, total: round(lines.reduce((sum, line) => sum + line.amount, 0)), tips: round(tips) };
}
