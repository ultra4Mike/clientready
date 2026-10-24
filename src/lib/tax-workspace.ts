/**
 * Reports & Taxes workspace: arranges numbers the app already computes (buildReport, taxCategories,
 * cashEntries, the Sales and expense log rows, accountantRows) the way an accountant reads them.
 * No new money math: only sums, splits by date and labels. Not tax advice; nothing is filed.
 */
import { cashEntries } from "@/lib/money";
import { cashIncome } from "@/lib/ledger";
import { irsMileageRate } from "@/lib/job-profit";
import { countedTrips, milesOf, type Trip } from "@/lib/mileage";
import { readPaySettings } from "@/lib/pay-types";
import type { TaxLine } from "@/lib/tax-categories";

type Doc = { id: string; type: string; createdAt?: string; data?: Record<string, unknown> };
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

export const NOT_TRACKED = "Not tracked yet";
export const DISCLAIMER = "Not tax advice. A starting point for you or your tax preparer.";

/** Cash received in the year, split the way Schedule C wants it (same entries as Reports "Collected"). */
export function incomeSplit(docs: Doc[], year: string) {
  const types = new Map(docs.map((d) => [d.id, d.type]));
  let payments = 0, deposits = 0, refunds = 0;
  for (const e of cashEntries(docs as never)) {
    if (!String(e.date).startsWith(year)) continue;
    if (e.amount < 0) refunds += -e.amount;
    else if (types.get(e.docId) === "proposal") deposits += e.amount;
    else payments += e.amount;
  }
  const gross = payments + deposits;
  // QA3: sales tax collected is owed to the state, not income (and not in the set-aside base).
  const salesTax = cashIncome(docs as never, `${year}-01-01`, `${year}-12-31`).salesTax;
  return { payments: r2(payments), deposits: r2(deposits), refunds: r2(refunds), gross: r2(gross), salesTax, net: r2(gross - refunds - salesTax) };
}

/** Standard-rate mileage deduction: each counted trip × the IRS rate for its day (same rate as job profit). */
export function mileageDeduction(trips: Trip[], year: string) {
  let miles = 0, amount = 0;
  for (const t of countedTrips(trips)) {
    if (!String(t.date || "").startsWith(year)) continue;
    miles += milesOf(t);
    amount += milesOf(t) * irsMileageRate(t.date);
  }
  return { miles: r2(miles), amount: r2(amount) };
}

/** Sales tax billed on this year's sent invoices (accountantRows invoiceRows: col 0 date, 7 tax, 8 total). */
export function salesTaxReport(invoiceRows: string[][]) {
  const months = Array.from({ length: 12 }, (_, m) => ({ month: m, taxable: 0, tax: 0 }));
  let invoices = 0;
  for (const row of invoiceRows) {
    const tax = num(row[7]);
    if (!(tax > 0)) continue;
    const m = Number(String(row[0]).slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    invoices++;
    months[m].tax += tax;
    months[m].taxable += num(row[8]) - tax;
  }
  const total = r2(months.reduce((s, m) => s + m.tax, 0));
  return { months: months.map((m) => ({ ...m, tax: r2(m.tax), taxable: r2(m.taxable) })), total, invoices };
}

export type ScheduleCRow = { line: string; label: string; amount: number | null; note?: string; kind?: "total" | "info" };

/** Schedule C laid out like the form. null = not tracked yet (never a guess). */
const LINE_LABELS: Record<string, string> = { "Line 8": "Advertising", "Line 9": "Car and truck expenses", "Line 10": "Commissions and fees", "Line 11": "Contract labor", "Line 13": "Depreciation and section 179", "Line 15": "Insurance (other than health)", "Line 16b": "Interest (other)", "Line 17": "Legal and professional services", "Line 18": "Office expense", "Line 20a": "Rent or lease: vehicles, machinery, equipment", "Line 20b": "Rent or lease: other business property", "Line 21": "Repairs and maintenance", "Line 22": "Supplies", "Line 23": "Taxes and licenses", "Line 24a": "Travel", "Line 24b": "Meals", "Line 25": "Utilities", "Line 26": "Wages", "Line 27a": "Other expenses" };
const lineOrder = (l: string) => { const m = l.match(/(\d+)([ab]?)/); return m ? Number(m[1]) * 10 + (m[2] === "b" ? 2 : m[2] === "a" ? 1 : 0) : 999; };

export function scheduleC(input: { income: ReturnType<typeof incomeSplit>; tax: { lines: TaxLine[]; total: number; tips: number }; miles: { miles: number; amount: number }; biz?: { line: string; amount: number }[] }): ScheduleCRow[] {
  const { income, tax, miles } = input;
  const biz = input.biz || [];
  const line = (key: string) => tax.lines.find((l) => l.key === key)?.amount ?? 0;
  const gross = income.gross;
  const bizTotal = r2(biz.reduce((sum, b) => sum + b.amount, 0));
  function expenseRows(): ScheduleCRow[] {
    const base: ScheduleCRow[] = [
    { line: "Line 9", label: "Car and truck expenses (actual gas)", amount: line("car"), note: miles.miles > 0 ? `Or the standard mileage rate: ${miles.miles} mi = ${miles.amount.toFixed(2)}. Use one method, not both.` : undefined },
    { line: "Line 11", label: "Contract labor (crew labor cost)", amount: line("labor"), note: "Move W-2 payroll to Line 26." },
    { line: "Line 22", label: "Supplies (parts, materials, job supplies)", amount: line("supplies") },
    { line: "Line 24b", label: "Meals", amount: line("meals"), note: "Full amount shown; usually only 50% is deductible." },
    { line: "Line 26", label: "Wages (W-2 employees)", amount: null, note: "Payroll is not split from Line 11 yet. See Payroll & contractors." },
    { line: "Line 27a", label: "Other expenses (other fees, dump fees)", amount: line("other") },
    ];
    for (const b of biz) {
      const have = base.find((row) => row.line === b.line);
      if (have) { have.amount = r2((have.amount ?? 0) + b.amount); have.note = [have.note, `Includes ${b.amount.toFixed(2)} business expenses.`].filter(Boolean).join(" "); }
      else base.push({ line: b.line, label: LINE_LABELS[b.line] || "Other", amount: b.amount, note: "From business expenses." });
    }
    return base.sort((x, y) => lineOrder(x.line) - lineOrder(y.line));
  }
  const net = r2(gross - income.refunds);
  return [
    { line: "Part I", label: "Income", amount: null, kind: "info" },
    { line: "Line 1", label: "Gross receipts (payments + deposits received)", amount: gross, note: tax.tips > 0 ? `Tips received ${tax.tips.toFixed(2)} are listed on Income; check they are in Line 1 once.` : undefined },
    { line: "Line 2", label: "Returns and allowances (refunds)", amount: income.refunds },
    { line: "Line 3", label: "Line 1 minus Line 2", amount: net, kind: "total" },
    { line: "Line 4", label: "Cost of goods sold (Part III)", amount: null, note: "Inventory and COGS are not tracked yet. Materials are on Line 22." },
    { line: "Line 7", label: "Gross income", amount: net, kind: "total" },
    { line: "Part II", label: "Expenses", amount: null, kind: "info" },
    ...expenseRows(),
    { line: "Line 28", label: "Total expenses (job costs + business expenses)", amount: r2(tax.total + bizTotal), kind: "total" },
    { line: "Line 30", label: "Business use of home", amount: null, note: "Home office is not tracked yet." },
    { line: "Line 31", label: "Net profit (Line 7 minus Line 28)", amount: r2(net - tax.total - bizTotal), kind: "total" },
  ];
}

/** IRS estimated-tax periods for a tax year. Due dates on a weekend move to Monday. */
export function quarterPeriods(year: string) {
  const y = Number(year);
  const due = (yy: number, m: number, d: number) => {
    const t = new Date(Date.UTC(yy, m - 1, d));
    while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  return [
    { q: "Q1", from: `${y}-01-01`, to: `${y}-03-31`, due: due(y, 4, 15) },
    { q: "Q2", from: `${y}-04-01`, to: `${y}-05-31`, due: due(y, 6, 15) },
    { q: "Q3", from: `${y}-06-01`, to: `${y}-08-31`, due: due(y, 9, 15) },
    { q: "Q4", from: `${y}-09-01`, to: `${y}-12-31`, due: due(y + 1, 1, 15) },
  ];
}

type LogRow = { kind: "in" | "out" | "pay"; date: string; amount: number };
/** Per period: the Sales and expense log's profit and its set-aside rule (profit > 0 × set-aside %). */
/** QA2: pass `collectedFor` (cashCollected) so Taxes and Overview share one collected number, dates and refund rules. */
export function quarterlyEstimates(rows: LogRow[], year: string, setAsidePercent: number, collectedFor?: (from: string, to: string) => number) {
  return quarterPeriods(year).map((p) => {
    const inP = rows.filter((r) => String(r.date).slice(0, 10) >= p.from && String(r.date).slice(0, 10) <= p.to);
    const collected = collectedFor ? collectedFor(p.from, p.to) : inP.filter((r) => r.kind === "in").reduce((s, r) => s + r.amount, 0);
    const spent = inP.filter((r) => r.kind !== "in").reduce((s, r) => s + r.amount, 0);
    const profit = collected - spent;
    return { ...p, collected: r2(collected), spent: r2(spent), profit: r2(profit), setAside: r2(profit > 0 ? profit * (setAsidePercent / 100) : 0) };
  });
}

type Person = { id: string; name: string; kind?: "employee" | "contractor"; paySettings?: unknown };
type PayRow = { kind: string; worker?: string; workerKind?: string; amount: number; hours?: string };
/** Crew pay per worker from the log's pay rows. 1099-NEC candidates: contractors paid $600 or more. */
export function payrollSummary(rows: PayRow[], employees: Person[]) {
  const by = new Map<string, { name: string; kind: string; payType: string; total: number; hours: number }>();
  for (const r of rows) {
    if (r.kind !== "pay" || !r.worker) continue;
    const person = employees.find((e) => e.name === r.worker);
    const cur = by.get(r.worker) || { name: r.worker, kind: r.workerKind || person?.kind || "employee", payType: readPaySettings(person?.paySettings).type, total: 0, hours: 0 };
    cur.total += r.amount;
    cur.hours += num(r.hours);
    by.set(r.worker, cur);
  }
  const workers = [...by.values()].map((w) => ({ ...w, total: r2(w.total), hours: r2(w.hours) })).sort((a, b) => b.total - a.total);
  const contractors = workers.filter((w) => w.kind === "contractor");
  const w2 = workers.filter((w) => w.kind !== "contractor");
  return {
    workers,
    nec: contractors.filter((w) => w.total >= 600),
    contractorTotal: r2(contractors.reduce((s, w) => s + w.total, 0)),
    w2Total: r2(w2.reduce((s, w) => s + w.total, 0)),
    w2Count: w2.length,
  };
}

/** QA4: crew pay grouped by the owner's pay period (same rows as the packet / Payroll tab). */
export function payrollByPeriod(rows: (PayRow & { date?: string })[], periodOf: (date: string) => { from: string; to: string }) {
  const by = new Map<string, { from: string; to: string; hours: number; total: number; workers: Set<string> }>();
  for (const r of rows) {
    if (r.kind !== "pay" || !/^\d{4}-\d{2}-\d{2}/.test(String(r.date))) continue;
    const p = periodOf(String(r.date).slice(0, 10)); const k = p.from;
    const cur = by.get(k) || { ...p, hours: 0, total: 0, workers: new Set<string>() };
    cur.hours += num(r.hours); cur.total += r.amount; if (r.worker) cur.workers.add(r.worker); by.set(k, cur);
  }
  return [...by.values()].map((v) => ({ from: v.from, to: v.to, hours: r2(v.hours), total: r2(v.total), people: v.workers.size })).sort((a, b) => b.from.localeCompare(a.from));
}

/** Costs that need a category: unnamed "other fees" and crew receipts typed Other. */
export function uncategorized(expenseRows: string[][], crewRows: string[][]) {
  const owner = expenseRows.filter((r) => r[3] === "Other fee").map((r) => ({ source: "Job cost", date: r[0], invoice: r[1], who: r[2], amount: num(r[5]) }));
  const crew = crewRows.filter((r) => r[3] === "Other").map((r) => ({ source: "Crew receipt", date: r[0], invoice: r[1], who: r[2], amount: num(r[4]) }));
  return [...owner, ...crew];
}

export type CheckItem = { key: string; label: string; done: boolean | null; detail: string; href: string };
/** Year-end checklist. done null = not tracked yet. */
export function yearEndChecklist(input: { businessName: string; taxId: string; uncategorized: number; crewReceipts: number; crewMissingPhoto: number; miles: number; nec: number; unpaid: number; unpaidTotal: number }): CheckItem[] {
  const i = input;
  return [
    { key: "business", label: "Business name and EIN", done: Boolean(i.businessName && i.businessName !== "Your business" && i.taxId), detail: i.taxId ? "EIN on file." : "Add your EIN (or SSN note) in Settings.", href: "/settings" },
    { key: "uncategorized", label: "Uncategorized costs", done: i.uncategorized === 0, detail: i.uncategorized ? `${i.uncategorized} to categorize.` : "Every cost has a category.", href: "/reports?tab=expenses" },
    { key: "receipts", label: "Receipts", done: i.crewReceipts ? i.crewMissingPhoto === 0 : null, detail: i.crewReceipts ? `${i.crewMissingPhoto} of ${i.crewReceipts} crew receipts have no photo. Owner job-cost receipts: ${NOT_TRACKED.toLowerCase()}.` : `Owner job-cost receipts: ${NOT_TRACKED.toLowerCase()}.`, href: "/documents" },
    { key: "mileage", label: "Mileage log", done: i.miles > 0, detail: i.miles > 0 ? `${i.miles} business miles logged.` : "No trips logged this year.", href: "/mileage" },
    { key: "1099", label: "1099 info for contractors", done: i.nec ? null : true, detail: i.nec ? `${i.nec} contractor(s) paid $600+. Their TIN and address are ${NOT_TRACKED.toLowerCase()}; collect a W-9.` : "No contractor reached $600.", href: "/employees" },
    { key: "unpaid", label: "Unpaid invoices", done: i.unpaid === 0, detail: i.unpaid ? `${i.unpaid} unpaid, ${i.unpaidTotal.toFixed(2)} still owed.` : "Nothing owed.", href: "/collect" },
  ];
}
