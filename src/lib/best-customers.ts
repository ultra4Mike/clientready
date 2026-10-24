import { readPayments } from "@/lib/payments";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { uniqueDocs } from "@/lib/change-orders";
import { clientKey } from "@/lib/portal";
import { ownerJobCost, yearMonth } from "@/lib/reports";
import { billedAmount, cashEntries } from "@/lib/money";
import { effectiveAmounts } from "@/lib/change-order-revision";
import { dedupeCopies } from "@/lib/doc-dedupe";
import { isVoidStatus } from "@/lib/payments";

/**
 * Best customers for one year, owner-only and read-only. Same rules as Reports: billed = sent invoices by
 * invoice date, collected = payments by date received, profit = billed minus owner job costs. Also: jobs,
 * average days to pay (invoices paid in full), still owed now (any year) and last job date.
 */
type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
export type CustomerRow = { key: string; clientId: string; name: string; jobs: number; billed: number; collected: number; otherCash?: number; profit: number; owed: number; avgDaysToPay: number | null; lastJob: string };
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
  const docs = uniqueDocs(dedupeCopies(allDocs as never) as Doc[]);
  const rowFor = (doc: Doc) => {
    const data = doc.data || {};
    const name = String(data.clientName || doc.clientName || "").trim() || "No client";
    const clientId = String(data.clientId || "");
    const key = clientId ? `id:${clientId}` : `name:${clientKey(name)}`;
    const row = map.get(key) || { key, clientId, name, jobs: 0, billed: 0, collected: 0, profit: 0, owed: 0, avgDaysToPay: null, lastJob: "", payDays: [] };
    map.set(key, row);
    return row;
  };
  // Collected: the shared cash calculation (R104/R126), so a proposal payment copied onto two invoices counts once
  // and void docs never count. Collected can never exceed the real payments.
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  for (const entry of cashEntries(allDocs)) {
    const doc = byId.get(entry.docId);
    if (doc && !isPendingRecurringDraft(doc) && yearMonth(entry.date)?.year === year) rowFor(doc).collected += entry.amount;
  }
  for (const doc of docs) {
    if (doc.type !== "invoice" || isPendingRecurringDraft(doc) || isVoidStatus(doc.data?.status) || doc.data?.deleted) continue;
    const data = doc.data || {};
    const row = rowFor(doc);
    // QA4: the ledger billed rule (billedAmount) so a version replaced by a revision is not billed or owed twice.
    const billedTotal = billedAmount(doc as never, docs as never);
    if (billedTotal === null) continue;
    const total = billedTotal;
    const owed = effectiveAmounts(docs as never, doc as never).owed;
    const payments = readPayments(data).filter((payment) => num(payment.amount) > 0);
    row.owed += owed;
    const date = ymd(data.invoiceDate || doc.createdAt);
    if (yearMonth(date)?.year !== year) continue;
    row.jobs += 1;
    row.billed += total;
    row.profit += total - ownerJobCost(data);
    if (date > row.lastJob) { row.lastJob = date; row.name = String(data.clientName || doc.clientName || "").trim() || "No client"; }
    if (owed <= 0.004 && payments.length) {
      const last = payments.map((payment) => ymd(payment.date)).filter(Boolean).sort().pop();
      if (last && date) row.payDays.push(Math.max(0, days(date, last)));
    }
  }
  const rows: CustomerRow[] = [...map.values()].filter((row) => row.jobs > 0 || row.collected > 0).map(({ payDays, ...row }) => ({
    // QA4: Collected for the year never shows above Billed; money received for other years' jobs (or ahead) is otherCash.
    ...row, billed: r2(row.billed), collected: r2(Math.min(row.collected, row.billed)), otherCash: r2(Math.max(0, row.collected - row.billed)), profit: r2(row.profit), owed: r2(row.owed),
    avgDaysToPay: payDays.length ? Math.round(payDays.reduce((sum, value) => sum + value, 0) / payDays.length) : null,
  }));
  return rows.sort((a, b) => b[sort] - a[sort] || b.collected - a.collected || a.name.localeCompare(b.name));
}
