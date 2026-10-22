import { crewKindLabel } from "@/lib/cost-categories";
import { csvText } from "@/lib/csv";
import { documentTotals, amountOf } from "@/lib/discount";
import { docAmounts } from "@/lib/doc-stage";
import { readPayments, tipTotal } from "@/lib/payments";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { uniqueDocs } from "@/lib/change-orders";
import { buildReport, MONTHS, yearMonth } from "@/lib/reports";
import { taxCategories } from "@/lib/tax-categories";
import { countedTrips, milesOf, totalMiles, type Trip } from "@/lib/mileage";

/**
 * Accountant package for one year: a ZIP of plain CSVs an accountant can open in any spreadsheet.
 * Read-only: it uses the same rules as Reports and Tax categories (sent invoices by invoice date,
 * payments by date received, owner job costs by invoice date), so the numbers match the screen.
 */
type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
type CrewExpense = { id?: string; amount?: unknown; created_at?: string; kind?: string; note?: string; worker_name?: string; doc_id?: string };

const r2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const day = (value: unknown) => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const COST_FIELDS: [string, string, string][] = [["parts", "Materials / parts", "Line 22"], ["tools", "Tools / job supplies", "Line 22"], ["gas", "Gas / fuel", "Line 9"], ["labor", "Crew labor", "Line 11"], ["lunch", "Meals (lunch)", "Line 24b"]];

export function accountantFiles(allDocs: Doc[], crew: CrewExpense[], trips: Trip[], year: string, business = "") {
  const docs = uniqueDocs(allDocs).filter((doc) => doc.type === "invoice" && !isPendingRecurringDraft(doc));
  const numberOf = (doc: Doc) => String(doc.data?.invoiceNumber || doc.title || "Invoice");
  const clientOf = (doc: Doc) => String(doc.data?.clientName || doc.clientName || "");
  const billed = docs.filter((doc) => String(doc.data?.status || "draft") !== "draft" && yearMonth(doc.data?.invoiceDate || doc.createdAt)?.year === year);

  const invoiceRows = billed.map((doc) => {
    const data = doc.data || {};
    const items = Array.isArray(data.items) ? (data.items as { qty?: unknown; rate?: unknown }[]) : [];
    const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
    const t = documentTotals(subtotal, String(data.taxPercent ?? ""), String(data.discountType ?? ""), String(data.discountValue ?? ""));
    const { paid, owed } = docAmounts(doc);
    return [day(data.invoiceDate || doc.createdAt), numberOf(doc), clientOf(doc), String(data.status || ""), r2(t.subtotal), r2(t.discount), String(data.taxPercent || "0"), r2(t.tax), r2(t.total), r2(paid), r2(owed)];
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const paymentRows: string[][] = [];
  for (const doc of docs) {
    const data = doc.data || {};
    const payments = readPayments(data).filter((payment) => amountOf(payment.amount) > 0);
    for (const payment of payments) {
      const when = day(payment.date || data.invoiceDate || doc.createdAt);
      if (yearMonth(when)?.year !== year) continue;
      paymentRows.push([when, numberOf(doc), clientOf(doc), payment.method || "", r2(amountOf(payment.amount)), r2(tipTotal([payment])), payment.ref || ""]);
    }
    if (!payments.length && data.status === "paid") {
      const when = day(data.paymentDate || data.invoiceDate || doc.createdAt);
      if (yearMonth(when)?.year === year) paymentRows.push([when, numberOf(doc), clientOf(doc), String(data.paymentMethod || ""), r2(docAmounts(doc).total), "0.00", "marked paid (no amount recorded)"]);
    }
  }
  paymentRows.sort((a, b) => a[0].localeCompare(b[0]));

  const expenseRows: string[][] = [];
  for (const doc of billed) {
    const data = doc.data || {};
    const costs = (data.jobCosts || {}) as Record<string, unknown>;
    const when = day(data.invoiceDate || doc.createdAt);
    for (const [key, label, line] of COST_FIELDS) if (amountOf(costs[key]) > 0) expenseRows.push([when, numberOf(doc), clientOf(doc), label, line, r2(amountOf(costs[key])), "Job costs"]);
    for (const fee of Array.isArray(costs.otherFees) ? (costs.otherFees as { name?: unknown; amount?: unknown }[]) : []) {
      if (amountOf(fee.amount) > 0) expenseRows.push([when, numberOf(doc), clientOf(doc), String(fee.name || "Other fee"), "Line 27a", r2(amountOf(fee.amount)), "Job costs"]);
    }
  }
  expenseRows.sort((a, b) => a[0].localeCompare(b[0]));
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const crewRows = crew.filter((item) => yearMonth(item.created_at)?.year === year).map((item) => {
    const doc = item.doc_id ? byId.get(item.doc_id) : undefined;
    // The owner's type fix on the invoice (crewKindFix) wins, so the receipt lands under the right category.
    const fixed = item.id ? ((doc?.data as { crewKindFix?: Record<string, string> } | undefined)?.crewKindFix || {})[item.id] : "";
    return [day(item.created_at), doc ? numberOf(doc) : "", item.worker_name || "", crewKindLabel(fixed || item.kind || "other"), r2(amountOf(item.amount)), item.note || ""];
  }).sort((a, b) => a[0].localeCompare(b[0]));

  const yearTrips = countedTrips(trips).filter((trip) => String(trip.date || "").startsWith(year)).sort((a, b) => a.date.localeCompare(b.date));
  const report = buildReport(allDocs, crew, year);
  const tax = taxCategories(allDocs, year);
  const summary: (string | number)[][] = [
    ["Business", business], ["Year", year], ["Made", day(new Date().toString())], ["", ""],
    ["Billed (sent invoices by invoice date)", r2(report.totals.billed)],
    ["Collected (payments by date received)", r2(report.totals.collected)],
    ["Tips collected (in payments)", r2(tax.tips)],
    ["Job costs (owner)", r2(report.totals.jobCosts)],
    ["Crew receipts (logged by crew, not added to job costs)", r2(report.totals.crewReceipts)],
    ["Job profit (billed - job costs)", r2(report.totals.profit)],
    ["Business miles", String(totalMiles(yearTrips, year))], ["", ""],
    ["Schedule C line", "Amount"],
    ...tax.lines.map((line) => [`${line.line} ${line.label}`, r2(line.amount)]),
    ["", ""], ["Month", "Billed / Collected / Job costs / Crew receipts"],
    ...report.months.map((row) => [MONTHS[row.month], `${r2(row.billed)} / ${r2(row.collected)} / ${r2(row.jobCosts)} / ${r2(row.crewReceipts)}`]),
    ["", ""], ["Expenses by category (owner job costs, each once; crew amounts count once you apply them)", "Amount"],
    ...expensesByCategory(expenseRows).map(([label, amount]) => [label, r2(amount)]),
  ];
  const readme = [
    `ClientReady accountant package, ${year}${business ? `, ${business}` : ""}`,
    "",
    "summary.csv   Year totals, Schedule C line suggestions and months.",
    "invoices.csv  Every sent invoice dated this year: subtotal, discount, tax, total, paid, still owed.",
    "payments.csv  Every payment received this year (by date received), with method, tip and reference.",
    "expenses.csv  Owner job costs on this year's invoices, each with a suggested Schedule C line.",
    "crew-receipts.csv  Costs the crew logged from the field (not added to job costs automatically).",
    "mileage.csv   Business trips this year.",
    "",
    "Schedule C lines are suggestions only. Your accountant decides the final categories.",
  ].join("\r\n");
  return [
    { name: "README.txt", text: readme },
    { name: "summary.csv", text: csvText(["Item", "Value"], summary) },
    { name: "invoices.csv", text: csvText(["Date", "Invoice", "Client", "Status", "Subtotal", "Discount", "Tax %", "Tax", "Total", "Paid", "Still owed"], invoiceRows) },
    { name: "payments.csv", text: csvText(["Date received", "Invoice", "Client", "Method", "Amount", "Tip", "Reference"], paymentRows) },
    { name: "expenses.csv", text: csvText(["Date", "Invoice", "Client", "Category", "Schedule C line", "Amount", "Source"], expenseRows) },
    { name: "crew-receipts.csv", text: csvText(["Date", "Invoice", "Worker", "Category", "Amount", "Note"], crewRows) },
    { name: "mileage.csv", text: csvText(["Date", "Miles", "From", "To", "Purpose"], yearTrips.map((trip) => [trip.date, String(milesOf(trip)), trip.from, trip.to, trip.purpose])) },
  ];
}

/** Year expenses by category from the job-cost rows (owner lines incl. their own named lines). Each cost once. */
export function expensesByCategory(expenseRows: string[][]) {
  const totals = new Map<string, number>();
  for (const row of expenseRows) totals.set(row[3], (totals.get(row[3]) || 0) + (Number(row[5]) || 0));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}
