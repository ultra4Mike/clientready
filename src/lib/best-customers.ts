import { docAmounts } from "@/lib/doc-stage";
import { readPayments } from "@/lib/payments";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { uniqueDocs } from "@/lib/change-orders";
import { clientKey } from "@/lib/portal";
import { ownerJobCost, yearMonth } from "@/lib/reports";

/**
 * Best customers for one year, owner-only and read-only. Same rules as Reports: billed = sent invoices by
 * invoice date, collected = payments by date received, profit = billed minus owner job costs. Also: jobs,
 * average days to pay (invoices paid in full), still owed now (any year) and last job date.
 */
type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type CustomerRow = { key: string; clientId: string; name: string; jobs: number; billed: number; collected: number; profit: number; owed: number; avgDaysToPay: number | null; lastJob: string };
export type CustomerSort = "profit" | "billed" | "collected" | "jobs";

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (value: unknown) => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function bestCustomers(allDocs: Doc[], year: string, sort: CustomerSort = "profit") {
  const map = new Map<string, CustomerRow & { payDays: number[] }>();
  for (const doc of uniqueDocs(allDocs)) {
    if (doc.type !== "invoice" || isPendingRecurringDraft(doc)) continue;
    const data = doc.data || {};
    const name = String(data.clientName || doc.clientName || "").trim() || "No client";
    const clientId = String(data.clientId || "");
    const key = clientId ? `id:${clientId}` : `name:${clientKey(name)}`;
    const row = map.get(key) || { key, clientId, name, jobs: 0, billed: 0, collected: 0, profit: 0, owed: 0, avgDaysToPay: null, lastJob: "", payDays: [] };
    map.set(key, row);
    const { total, owed } = docAmounts(doc);
    const payments = readPayments(data).filter((payment) => num(payment.amount) > 0);
    for (const payment of payments) if (yearMonth(payment.date || data.invoiceDate || doc.createdAt)?.year === year) row.collected += num(payment.amount);
    if (String(data.status || "draft") === "draft") continue;
    row.owed += owed;
    const date = ymd(data.invoiceDate || doc.createdAt);
    if (yearMonth(date)?.year !== year) continue;
    row.jobs += 1;
    row.billed += total;
    row.profit += total - ownerJobCost(data);
    if (date > row.lastJob) { row.lastJob = date; row.name = name; }
    if (owed <= 0.004 && payments.length) {
      const last = payments.map((payment) => ymd(payment.date)).filter(Boolean).sort().pop();
      if (last && date) row.payDays.push(Math.max(0, days(date, last)));
    }
  }
  const rows: CustomerRow[] = [...map.values()].filter((row) => row.jobs > 0 || row.collected > 0).map(({ payDays, ...row }) => ({
    ...row, billed: r2(row.billed), collected: r2(row.collected), profit: r2(row.profit), owed: r2(row.owed),
    avgDaysToPay: payDays.length ? Math.round(payDays.reduce((sum, value) => sum + value, 0) / payDays.length) : null,
  }));
  return rows.sort((a, b) => b[sort] - a[sort] || b.collected - a.collected || a.name.localeCompare(b.name));
}
