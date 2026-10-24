"use client";

import LaborReport from "@/components/timesheet/LaborReport";
import { shortDay } from "@/lib/followups";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";
import { buildReport, MONTHS, reportYears, type JobRow, type MonthRow } from "@/lib/reports";
import { csvText, downloadCsv } from "@/lib/csv";
import { accountantFiles, accountantRows } from "@/lib/accountant-export";
import { downloadBytes, zipFiles } from "@/lib/zip";
import { taxCategories } from "@/lib/tax-categories";
import { bestCustomers, type CustomerRow, type CustomerSort } from "@/lib/best-customers";
import { mileage, type Trip } from "@/lib/mileage";
import YearView, { type YearData } from "@/components/views/YearView";
import DataTable, { usd } from "@/components/reports/DataTable";
import BusinessExpenses from "@/components/reports/BusinessExpenses";
import { bizByLine, bizExpenses, bizOccurrences, type BizExpense } from "@/lib/business-expenses";
import { billedOutstanding, cashCollected } from "@/lib/money";
import { DISCLAIMER, incomeSplit, mileageDeduction, NOT_TRACKED, payrollSummary, quarterlyEstimates, salesTaxReport, scheduleC, uncategorized, yearEndChecklist } from "@/lib/tax-workspace";
import { REPORT_TABS, reportsParams, type ReportTab } from "@/lib/view-routes";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
type CrewExpense = { id?: string; receipt?: string; amount?: unknown; created_at?: string; kind?: string; note?: string; worker_name?: string; doc_id?: string };


/** Owner-only (AppShell sends crew accounts to /crew). Reads the local cache; never changes anything. */
export default function ReportsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [crewExpenses, setCrewExpenses] = useState<CrewExpense[]>([]);
  const [year, setYearState] = useState(String(new Date().getFullYear()));
  // No flash: the tab comes from the URL before anything renders (null until read after mount).
  const [tab, setTabState] = useState<ReportTab | null>(null);
  useEffect(() => {
    const { tab: t, year: y } = reportsParams(window.location.search);
    Promise.resolve().then(() => { if (y) setYearState(y); setTabState(t); });
  }, []);
  const syncUrl = (t: ReportTab, y: string) => window.history.replaceState(null, "", `/reports?tab=${t}&year=${y}`);
  const setYear = (y: string) => { setYearState(y); if (tab) syncUrl(tab, y); };
  const setTab = (t: ReportTab) => { setTabState(t); syncUrl(t, year); };

  const [crewLoaded, setCrewLoaded] = useState(false);
  useEffect(() => {
    // Read after mount so the static render and the first client render match.
    Promise.resolve().then(() => {
      try {
        setDocuments(JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"));
      } catch {
        setDocuments([]);
      }
      setDocsLoaded(true);
    });
    // R120: crew receipts show "…" until they load (not $0).
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return setCrewLoaded(true);
      supabase.from("crew_expenses").select("id, amount, created_at, kind, note, worker_name, doc_id, receipt").then(({ data: rows, error }) => {
        if (!error && rows) setCrewExpenses(rows as CrewExpense[]);
        setCrewLoaded(true);
      });
    });
  }, []);

  const years = useMemo(() => { const list = reportYears(documents); return list.includes(year) ? list : [...list, year].sort().reverse(); }, [documents, year]);
  const report = useMemo(() => buildReport(documents, crewExpenses, year), [documents, crewExpenses, year]);
  const tax = useMemo(() => taxCategories(documents, year), [documents, year]);
  const [customerSort, setCustomerSort] = useState<CustomerSort>("profit");
  const customers = useMemo(() => bestCustomers(documents, year, customerSort), [documents, year, customerSort]);
  // Mileage log and business expenses: local first, then synced from the account.
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bizList, setBizList] = useState<BizExpense[]>([]);
  useEffect(() => {
    Promise.resolve().then(() => { setTrips(mileage.read()); setBizList(bizExpenses.read()); });
    mileage.sync().then(setTrips).catch(() => {});
    bizExpenses.sync().then(setBizList).catch(() => {});
  }, []);
  const [yearData, setYearData] = useState<YearData | null>(null);
  const miles = useMemo(() => mileageDeduction(trips, year), [trips, year]);
  const bizOcc = useMemo(() => bizOccurrences(bizList, year), [bizList, year]);
  const bizLines = useMemo(() => bizByLine(bizOcc), [bizOcc]);
  const bizTotal = bizLines.reduce((sum, l) => sum + l.amount, 0);
  const income = useMemo(() => incomeSplit(documents, year), [documents, year]);
  const acct = useMemo(() => accountantRows(documents, crewExpenses, trips, year, "", bizOcc), [documents, crewExpenses, trips, year, bizOcc]);
  const salesTax = useMemo(() => salesTaxReport(acct.invoiceRows), [acct]);
  const schedC = useMemo(() => scheduleC({ income, tax, miles, biz: bizLines }), [income, tax, miles, bizLines]);
  const expensesTotal = tax.total + bizTotal;
  const netProfit = schedC.find((r) => r.line === "Line 31")?.amount ?? income.net - expensesTotal;
  const expenseLines = useMemo(() => {
    const map = new Map<string, { line: string; label: string; amount: number }>();
    for (const l of tax.lines) map.set(l.line, { line: l.line, label: l.label, amount: l.amount });
    for (const b of bizOcc) { const cur = map.get(b.line) || { line: b.line, label: b.categoryLabel, amount: 0 }; cur.amount = Math.round((cur.amount + b.amount) * 100) / 100; map.set(b.line, cur); }
    return [...map.values()].filter((r) => r.amount);
  }, [tax, bizOcc]);
  const clientsAll = useMemo(() => bestCustomers(documents, year, "collected"), [documents, year]);
  const unpaid = useMemo(() => { const b = billedOutstanding(documents as never, `${year}-01-01`, `${year}-12-31`); return { total: b.outstanding, count: b.owedCount }; /* QA2: total and count from the one shared loop */ }, [documents, year]);
  const uncat = useMemo(() => uncategorized(acct.expenseRows, acct.crewRows), [acct]);
  const payroll = useMemo(() => (yearData ? payrollSummary(yearData.rows, yearData.employees) : null), [yearData]);
  const quarters = useMemo(() => (yearData ? quarterlyEstimates(yearData.rows, year, yearData.setAsidePercent, (from, to) => cashCollected(documents as never, from, to)) : null), [yearData, year, documents]);
  const crewYear = crewExpenses.filter((c) => String(c.created_at || "").startsWith(year));
  const checklist = yearData && payroll ? yearEndChecklist({ businessName: yearData.businessName, taxId: yearData.taxId, uncategorized: uncat.length, crewReceipts: crewYear.length, crewMissingPhoto: crewYear.filter((c) => !c.receipt).length, miles: miles.miles, nec: payroll.nec.length, unpaid: unpaid.count, unpaidTotal: unpaid.total }) : null;
  const cell = "px-2 py-1.5 text-right tabular-nums";

  return (
    <AppShell title="Reports & Taxes">
      <div className="print:hidden"><PageHeader title="Reports & Taxes" subtitle="Your year in one place: overview, tax packet and accountant files." /></div>
      <div data-testid="reports" data-year={year} data-tab={tab ?? "loading"} className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">
              Year
              <select data-testid="report-year" data-loaded={docsLoaded} disabled={!docsLoaded} aria-busy={!docsLoaded} value={docsLoaded ? year : ""} onChange={(event) => setYear(event.target.value)} className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm">
                {/* No flash: the year list is built only after the saved documents load (never "this year only" first). */}
                {docsLoaded ? years.map((option) => <option key={option} value={option}>{option}</option>) : <option value="">Loading…</option>}
              </select>
            </label>
          <div role="tablist" aria-label="Reports & Taxes" className="flex flex-wrap gap-1 rounded-xl border border-teal-500/20 p-1">
            {REPORT_TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} data-testid={`reports-tab-${key}`} onClick={() => setTab(key)} className={`min-h-11 rounded-lg px-4 text-sm font-medium transition ${tab === key ? "bg-teal-500 text-slate-950!" : "text-teal-700 hover:bg-teal-500/10 dark:text-teal-300"}`}>{label}</button>
            ))}
          </div>
        </div>
        {!tab && <p data-testid="reports-loading" className="text-sm text-slate-500">Loading…</p>}
        {tab && <p className="text-xs text-slate-500 print:hidden" data-testid="reports-disclaimer">{DISCLAIMER} <Link href="/help?q=reports" className="text-teal-600 underline" data-testid="reports-help">Help: Reports &amp; Taxes</Link></p>}
        {tab === "overview" && (
          <div data-testid="reports-overview" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="pl-cards">
              <Stat testid="pl-income" label="Income (collected)" value={usd(income.net)} sub={`Billed ${usd(report.totals.billed)}`} />
              <Stat testid="pl-expenses" label="Expenses" value={usd(expensesTotal)} sub={`Job costs ${usd(tax.total)} + business ${usd(bizTotal)}`} />
              <Stat testid="pl-net" label="Net profit (Sched. C Line 31)" value={usd(netProfit)} sub="Collected minus expenses" />
              <Stat testid="pl-setaside" label="Set aside for taxes (estimate)" value={yearData ? usd(yearData.summary.setAside) : LOADING} sub={yearData ? `${yearData.setAsidePercent}% of log profit, from Settings` : ""} />
            </div>
            <section className={CARD}>
              <h2 className="text-base font-semibold">Month by month</h2>
              <MonthChart months={report.months} />
            <div className="overflow-x-auto">
              <table data-testid="report-months" className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="px-2 py-1.5 text-left">Month</th>
                    <th className={cell}>Billed</th>
                    <th className={cell}>Collected</th>
                    <th className={cell}>Job costs</th>
                    <th className={cell}>Crew receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {report.months.map((row) => (
                    <tr key={row.month} data-testid="report-month" data-month={row.month + 1} data-billed={row.billed.toFixed(2)} data-collected={row.collected.toFixed(2)} data-job-costs={row.jobCosts.toFixed(2)} data-crew-receipts={row.crewReceipts.toFixed(2)} className="border-t border-slate-200/60">
                      <td className="px-2 py-1.5">{MONTHS[row.month]}</td>
                      <td className={cell}>{usd(row.billed)}</td>
                      <td className={cell}>{usd(row.collected)}</td>
                      <td className={cell}>{usd(row.jobCosts)}</td>
                      <td className={cell} data-testid="report-crew-receipts" data-loading={crewLoaded ? undefined : "true"}>{crewLoaded ? usd(row.crewReceipts) : "…"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr data-testid="report-total" data-billed={report.totals.billed.toFixed(2)} data-collected={report.totals.collected.toFixed(2)} data-job-costs={report.totals.jobCosts.toFixed(2)} data-crew-receipts={report.totals.crewReceipts.toFixed(2)} className="border-t border-slate-300 font-semibold">
                    <td className="px-2 py-1.5">Total</td>
                    <td className={cell}>{usd(report.totals.billed)}</td>
                    <td className={cell}>{usd(report.totals.collected)}</td>
                    <td className={cell}>{usd(report.totals.jobCosts)}</td>
                    <td className={cell} data-testid="report-crew-receipts-total" data-loading={crewLoaded ? undefined : "true"}>{crewLoaded ? usd(report.totals.crewReceipts) : "…"}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="mt-1 text-xs text-slate-500">Collected counts payments by the date received. Crew receipts are shown for your records and not added to job costs.</p>
            </div>

            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">Profit by job</h2>
              <div data-testid="report-jobs" data-profit={report.totals.profit.toFixed(2)} className="mt-2">
                {report.jobs.length === 0 ? <p data-testid="report-jobs-empty" className="text-sm text-slate-500">No invoices sent in {year}.</p> : (
                  <DataTable<JobRow> testid="report-jobs-table" rowTestId="report-job" rowAttrs={(job) => ({ "data-id": job.id, "data-total": job.total.toFixed(2), "data-net": job.net.toFixed(2), "data-cost": job.cost.toFixed(2), "data-profit": job.profit.toFixed(2) })} csvName={`report-${year}-jobs.csv`} empty={`No invoices sent in ${year}.`} rows={report.jobs}
                    columns={[
                      { key: "date", label: "Job date", type: "date", value: (job) => (job.jobDate || job.date).slice(0, 10) },
                      { key: "job", label: "Job", value: (job) => job.number, filter: true, render: (job) => <><Link href={`/invoice?id=${encodeURIComponent(job.id)}`} className="text-teal-600 hover:underline">{job.number}</Link> {job.jobDate ? <span className="whitespace-nowrap text-xs tabular-nums text-slate-500" data-testid="report-job-date" data-date={job.jobDate}>· Job {shortDay(job.jobDate)}</span> : <span className="text-xs text-slate-500">{MONTHS[job.month]}</span>}</> },
                      { key: "client", label: "Client", value: (job) => job.client, filter: true },
                      { key: "total", label: "Invoice total", type: "money", value: (job) => job.total },
                      { key: "net", label: "Net", type: "money", value: (job) => job.net, render: (job) => <span data-testid="report-job-net">{usd(job.net)}</span> },
                      { key: "cost", label: "All costs", type: "money", value: (job) => job.cost, render: (job) => <span data-testid="report-job-cost" title={job.lines.map((line) => `${line.label}: ${usd(line.amount)}`).join("\n") || "No costs entered"}>{usd(job.cost)}</span> },
                      { key: "profit", label: "Profit", type: "money", value: (job) => job.profit },
                    ]}
                    footer={(shown) => <tr className="border-t border-slate-300 font-semibold"><td className="px-2 py-1.5" colSpan={6}>Total profit (shown)</td><td className="px-2 py-1.5 text-right tabular-nums">{usd(shown.reduce((sum, job) => sum + job.profit, 0))}</td></tr>} />
                )}
              </div>
            </section>
            <LaborReport docs={documents} />
            <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5" data-testid="best-customers">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Best customers {year}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">Sort by
                    <select data-testid="best-sort" value={customerSort} onChange={(event) => setCustomerSort(event.target.value as CustomerSort)} className="min-h-11 rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm">
                      <option value="profit">Profit</option><option value="billed">Billed</option><option value="collected">Collected</option><option value="jobs">Jobs</option>
                    </select>
                  </label>
                  <button type="button" data-testid="best-export" disabled={!customers.length} onClick={() => downloadCsv(`clientready-best-customers-${year}.csv`, csvText(["Rank", "Client", "Jobs", "Billed", "Collected", "Profit", "Avg days to pay", "Still owed", "Last job"], customers.map((row, index) => [index + 1, row.name, row.jobs, row.billed.toFixed(2), row.collected.toFixed(2), row.profit.toFixed(2), row.avgDaysToPay ?? "", row.owed.toFixed(2), row.lastJob])))} className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/40 px-4 text-sm font-medium text-teal-700 disabled:opacity-50 dark:text-teal-300">Export CSV</button>
                </div>
              </div>
              {customers.length === 0 ? <p className="mt-2 text-sm text-[var(--cr-muted)]">No billed jobs in {year} yet.</p> : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-slate-500"><th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">Client</th><th className={cell}>Jobs</th><th className={cell}>Billed</th><th className={cell}>Collected</th><th className={cell}>Profit</th><th className={cell}>Avg days to pay</th><th className={cell}>Still owed</th></tr></thead>
                    <tbody>
                      {customers.slice(0, 10).map((row, index) => (
                        <tr key={row.key} data-testid="best-row" data-profit={row.profit.toFixed(2)} data-billed={row.billed.toFixed(2)} className="border-t border-slate-200/60">
                          <td className="px-2 py-1.5">{index + 1}</td>
                          <td className="px-2 py-1.5">{row.clientId ? <a href={`/clients/${encodeURIComponent(row.clientId)}`} className="font-medium underline-offset-2 hover:underline">{row.name}</a> : <span className="font-medium">{row.name}</span>}{row.lastJob && <span className="block text-xs text-[var(--cr-muted)]">last job {row.lastJob}</span>}</td>
                          <td className={cell}>{row.jobs}</td>
                          <td className={cell}>{usd(row.billed)}</td>
                          <td className={cell}>{usd(row.collected)}</td>
                          <td className={`${cell} font-semibold ${row.profit < 0 ? "text-rose-700" : ""}`}>{usd(row.profit)}</td>
                          <td className={cell}>{row.avgDaysToPay === null ? "—" : `${row.avgDaysToPay} d`}</td>
                          <td className={cell}>{row.owed > 0 ? usd(row.owed) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {customers.length > 10 && <p className="mt-1 text-xs text-[var(--cr-muted)]">Top 10 of {customers.length}. Export CSV for all.</p>}
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "income" && (
          <div data-testid="reports-income" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat testid="inc-billed" label="Billed (sent invoices)" value={usd(report.totals.billed)} sub="By invoice date" />
              <Stat testid="inc-collected" label="Collected (cash basis)" value={usd(income.net)} sub="By date received, after refunds" />
              <Stat testid="inc-owed" label="Still owed" value={usd(unpaid.total)} sub={`${unpaid.count} invoice(s)`} />
            </div>
            <section className={CARD} data-testid="inc-kept-separate">
              <h2 className="text-base font-semibold">Kept separate from income</h2>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <Pair label="Invoice payments" value={usd(income.payments)} />
                <Pair testid="inc-deposits" label="Deposits on proposals (not yet invoiced)" value={usd(income.deposits)} />
                <Pair testid="inc-refunds" label="Refunds paid back (Line 2)" value={usd(income.refunds)} />
                <Pair testid="inc-tips" label="Tips received" value={usd(tax.tips)} />
                <Pair testid="inc-sales-tax" label="Sales tax billed (owed to the state, not income)" value={usd(salesTax.total)} />
              </dl>
            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">By client</h2>
              <DataTable<CustomerRow> testid="inc-clients" csvName={`income-${year}-clients.csv`} empty={`No billed jobs in ${year} yet.`} rows={clientsAll} initialSort={{ key: "collected", dir: "desc" }}
                columns={[
                  { key: "client", label: "Client", value: (r) => r.name, filter: true },
                  { key: "jobs", label: "Jobs", type: "number", value: (r) => r.jobs },
                  { key: "billed", label: "Billed", type: "money", value: (r) => r.billed },
                  { key: "collected", label: "Collected", type: "money", value: (r) => r.collected },
                  { key: "owed", label: "Still owed", type: "money", value: (r) => r.owed },
                ]} />
            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">By month</h2>
              <DataTable<MonthRow> testid="inc-months" csvName={`income-${year}-months.csv`} empty="" rows={report.months}
                columns={[
                  { key: "month", label: "Month", value: (r) => `${year}-${String(r.month + 1).padStart(2, "0")}`, type: "date", render: (r) => MONTHS[r.month] },
                  { key: "billed", label: "Billed", type: "money", value: (r) => r.billed },
                  { key: "collected", label: "Collected", type: "money", value: (r) => r.collected },
                ]} />
            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">Payments received</h2>
              <DataTable<string[]> testid="inc-payments" csvName={`income-${year}-payments.csv`} empty={`No payments received in ${year}.`} rows={acct.paymentRows} initialSort={{ key: "date", dir: "desc" }}
                columns={[
                  { key: "date", label: "Date received", type: "date", value: (r) => r[0] },
                  { key: "job", label: "Invoice", value: (r) => r[1], filter: true },
                  { key: "client", label: "Client", value: (r) => r[2], filter: true },
                  { key: "method", label: "Payment method", value: (r) => r[3], filter: true },
                  { key: "amount", label: "Amount", type: "money", value: (r) => Number(r[4]) },
                  { key: "tip", label: "Tip", type: "money", value: (r) => Number(r[5]) },
                  { key: "ref", label: "Reference", value: (r) => r[6] },
                ]} />
            </section>
          </div>
        )}
        {tab === "expenses" && (
          <div data-testid="reports-expenses" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat testid="exp-job" label="Job costs" value={usd(tax.total)} sub="On sent invoices" />
              <Stat testid="exp-biz" label="Business expenses" value={usd(bizTotal)} sub="Overhead, not on a job" />
              <Stat testid="exp-crew" label="Crew receipts" value={crewLoaded ? usd(report.totals.crewReceipts) : LOADING} sub="Logged by crew; apply on the invoice" />
              <Stat testid="exp-miles" label="Mileage (standard rate)" value={usd(miles.amount)} sub={`${miles.miles} business mi × IRS rate`} />
            </div>
            <section className={CARD}>
              <h2 className="text-base font-semibold">By Schedule C line</h2>
              <DataTable<{ line: string; label: string; amount: number }> testid="exp-lines" csvName={`expenses-${year}-schedule-c.csv`} empty="No expenses yet." rows={expenseLines}
                columns={[
                  { key: "line", label: "Schedule C line", value: (r) => r.line, filter: true },
                  { key: "label", label: "Category", value: (r) => r.label },
                  { key: "amount", label: "Amount", type: "money", value: (r) => r.amount },
                ]} />
            </section>
            <BusinessExpenses list={bizList} occurrences={bizOcc} year={year} onChange={setBizList} />
            <section className={CARD}>
              <h2 className="text-base font-semibold">Job costs</h2>
              <DataTable<string[]> testid="exp-job-costs" csvName={`expenses-${year}-job-costs.csv`} empty={`No job costs on ${year} invoices.`} rows={acct.expenseRows.filter((r) => r[6] === "Job costs")} initialSort={{ key: "date", dir: "desc" }}
                columns={[
                  { key: "date", label: "Date", type: "date", value: (r) => r[0] },
                  { key: "job", label: "Invoice", value: (r) => r[1], filter: true },
                  { key: "client", label: "Client", value: (r) => r[2], filter: true },
                  { key: "category", label: "Category", value: (r) => r[3], filter: true },
                  { key: "line", label: "Schedule C line", value: (r) => r[4], filter: true },
                  { key: "amount", label: "Amount", type: "money", value: (r) => Number(r[5]) },
                ]} />
            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">Crew receipts</h2>
              {!crewLoaded ? <p className="text-sm text-slate-500" data-testid="exp-crew-loading">{LOADING}</p> : (
                <DataTable<string[]> testid="exp-crew-receipts" csvName={`expenses-${year}-crew-receipts.csv`} empty={`No crew receipts in ${year}.`} rows={acct.crewRows}
                  columns={[
                    { key: "date", label: "Date", type: "date", value: (r) => r[0] },
                    { key: "job", label: "Invoice", value: (r) => r[1], filter: true },
                    { key: "worker", label: "Worker", value: (r) => r[2], filter: true },
                    { key: "category", label: "Category", value: (r) => r[3], filter: true },
                    { key: "amount", label: "Amount", type: "money", value: (r) => Number(r[4]) },
                    { key: "note", label: "Note", value: (r) => r[5] },
                  ]} />
              )}
            </section>
            <section className={CARD}>
              <h2 className="text-base font-semibold">Mileage</h2>
              <p className="text-sm" data-testid="exp-mileage">{miles.miles > 0 ? <>{miles.miles} business miles in {year} × the IRS rate for each trip&apos;s date = <b>{usd(miles.amount)}</b> (Line 9 if you use the standard mileage rate instead of actual gas).</> : <>No trips in the mileage log for {year}. <Link href="/mileage" className="text-teal-600 underline">Open the mileage log</Link></>}</p>
            </section>
            <section className={CARD} data-testid="exp-uncategorized">
              <h2 className="text-base font-semibold">Needs a category ({uncat.length})</h2>
              <p className="text-xs text-slate-500">Unnamed “other fees” on invoices and crew receipts typed Other. Open the invoice to name or retype them.</p>
              <DataTable<(typeof uncat)[number]> testid="exp-uncat-table" csvName={`expenses-${year}-uncategorized.csv`} empty="Nothing to fix. Every cost has a category." rows={uncat}
                columns={[
                  { key: "date", label: "Date", type: "date", value: (r) => r.date },
                  { key: "category", label: "Source", value: (r) => r.source, filter: true },
                  { key: "job", label: "Invoice", value: (r) => r.invoice, filter: true },
                  { key: "who", label: "Client / worker", value: (r) => r.who },
                  { key: "amount", label: "Amount", type: "money", value: (r) => r.amount },
                ]} />
            </section>
          </div>
        )}
        {tab === "payroll" && (
          <div data-testid="reports-payroll" className="space-y-6">
            {!payroll ? <p className="text-sm text-slate-500" data-testid="payroll-loading">{LOADING}</p> : (<>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat testid="pay-w2" label="W-2 employees" value={usd(payroll.w2Total)} sub={`${payroll.w2Count} people · already in job costs`} />
                <Stat testid="pay-1099" label="Contractors (1099)" value={usd(payroll.contractorTotal)} sub={`${payroll.nec.length} at $600 or more`} />
                <Stat testid="pay-withholding" label="Payroll taxes withheld" value={NOT_TRACKED} sub="Run payroll in your payroll service" />
              </div>
              <section className={CARD}>
                <h2 className="text-base font-semibold">Crew pay by worker</h2>
                <DataTable<(typeof payroll.workers)[number]> testid="pay-workers" csvName={`payroll-${year}-workers.csv`} empty={`No crew pay in ${year}.`} rows={payroll.workers} initialSort={{ key: "total", dir: "desc" }}
                  columns={[
                    { key: "worker", label: "Worker", value: (r) => r.name, filter: true },
                    { key: "category", label: "Type", value: (r) => (r.kind === "contractor" ? "Contractor (1099)" : "Employee (W-2)"), filter: true },
                    { key: "paytype", label: "Pay type", value: (r) => r.payType, filter: true },
                    { key: "hours", label: "Hours", type: "number", value: (r) => r.hours },
                    { key: "total", label: "Paid", type: "money", value: (r) => r.total },
                  ]} />
              </section>
              <section className={CARD} data-testid="pay-nec">
                <h2 className="text-base font-semibold">1099-NEC candidates (contractors paid $600+)</h2>
                <p className="text-xs text-slate-500">From crew pay on your jobs. Contractor TIN and mailing address are {NOT_TRACKED.toLowerCase()}: collect a W-9 from each. Card or PayPal payments may be reported by the processor instead (1099-K).</p>
                <DataTable<(typeof payroll.nec)[number]> testid="pay-nec-table" csvName={`payroll-${year}-1099-nec.csv`} empty="No contractor reached $600 this year." rows={payroll.nec}
                  columns={[
                    { key: "worker", label: "Contractor", value: (r) => r.name, filter: true },
                    { key: "total", label: "Paid in " + year, type: "money", value: (r) => r.total },
                    { key: "tin", label: "TIN / address", value: () => NOT_TRACKED },
                  ]} />
              </section>
            </>)}
          </div>
        )}
        {tab === "taxes" && (
          <div data-testid="reports-taxes" className="space-y-6">
            <section className={CARD} data-testid="sched-c">
              <h2 className="text-base font-semibold">Schedule C summary ({year})</h2>
              <p className="text-xs text-slate-500">Cash basis: income by date received; job costs by invoice date; business expenses by their date. {DISCLAIMER}</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {schedC.map((row) => (
                      <tr key={row.line + row.label} data-testid="sched-c-line" data-line={row.line} data-amount={row.amount === null ? "" : row.amount.toFixed(2)} className={`border-t border-slate-200/60 align-top ${row.kind === "total" ? "font-semibold" : ""} ${row.kind === "info" ? "bg-slate-500/5 text-xs uppercase tracking-wide text-slate-500" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-2">{row.kind === "info" ? row.line : <span className="inline-block rounded-md bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">{row.line}</span>}</td>
                        <td className="px-2 py-2">{row.label}{row.note && <span className="block text-xs font-normal text-slate-500">{row.note}</span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.kind === "info" ? "" : row.amount === null ? <span className="text-xs text-slate-500" data-testid="not-tracked">{NOT_TRACKED}</span> : usd(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={CARD} data-testid="quarterly">
              <h2 className="text-base font-semibold">Quarterly estimated tax helper</h2>
              <p className="text-xs text-slate-500">Estimate only, not advice: each period&apos;s profit from the Sales and expense log × your set-aside %{yearData ? ` (${yearData.setAsidePercent}%)` : ""}. Federal 1040-ES dates; a weekend date moves to Monday. Your state may differ.</p>
              {!quarters ? <p className="text-sm text-slate-500">{LOADING}</p> : (
                <DataTable<(typeof quarters)[number]> testid="quarterly-table" csvName={`taxes-${year}-quarterly.csv`} empty="" rows={quarters}
                  columns={[
                    { key: "q", label: "Period", value: (r) => r.q, render: (r) => <span>{r.q} <span className="text-xs text-slate-500">{r.from.slice(5)}–{r.to.slice(5)}</span></span> },
                    { key: "date", label: "Due", type: "date", value: (r) => r.due },
                    { key: "collected", label: "Collected", type: "money", value: (r) => r.collected },
                    { key: "spent", label: "Spent", type: "money", value: (r) => r.spent },
                    { key: "profit", label: "Profit", type: "money", value: (r) => r.profit },
                    { key: "setaside", label: "Set aside (estimate)", type: "money", value: (r) => r.setAside },
                  ]} />
              )}
            </section>
            <section className={CARD} data-testid="sales-tax">
              <h2 className="text-base font-semibold">Sales tax collected</h2>
              <p className="text-xs text-slate-500">Tax billed on {salesTax.invoices} sent invoice(s) dated {year}. Not income: it is owed to your state. Filing periods and rates by location are {NOT_TRACKED.toLowerCase()}.</p>
              <DataTable<(typeof salesTax.months)[number]> testid="sales-tax-table" csvName={`taxes-${year}-sales-tax.csv`} empty="" rows={salesTax.months.filter((m) => m.tax > 0)}
                columns={[
                  { key: "month", label: "Month", type: "date", value: (r) => `${year}-${String(r.month + 1).padStart(2, "0")}`, render: (r) => MONTHS[r.month] },
                  { key: "taxable", label: "Taxable sales (after discount)", type: "money", value: (r) => r.taxable },
                  { key: "tax", label: "Sales tax", type: "money", value: (r) => r.tax },
                ]}
                footer={() => <tr className="border-t border-slate-300 font-semibold"><td className="px-2 py-1.5" colSpan={2}>Total</td><td className="px-2 py-1.5 text-right tabular-nums" data-testid="sales-tax-total">{usd(salesTax.total)}</td></tr>} />
            </section>
            <section className={CARD} data-testid="checklist">
              <h2 className="text-base font-semibold">Year-end checklist</h2>
              {!checklist ? <p className="text-sm text-slate-500">{LOADING}</p> : (
                <ul className="mt-2 divide-y divide-slate-200/60">
                  {checklist.map((item) => (
                    <li key={item.key} data-testid="check-item" data-key={item.key} data-done={item.done === null ? "unknown" : String(item.done)} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${item.done === true ? "bg-teal-500 text-slate-950" : item.done === false ? "bg-amber-400 text-slate-950" : "bg-slate-300 text-slate-700"}`}>{item.done === true ? "✓" : item.done === false ? "!" : "?"}</span>
                      <span className="min-w-0 flex-1"><b>{item.label}</b><span className="block text-xs text-slate-500">{item.detail}</span></span>
                      {item.done !== true && <Link href={item.href} className="min-h-11 rounded-lg border border-teal-500/40 px-3 py-2.5 text-sm font-medium text-teal-700 dark:text-teal-300">Fix</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5" data-testid="tax-categories" data-total={tax.total.toFixed(2)}>
              <h2 className="text-base font-semibold">Job costs by Schedule C line</h2>
              <p className="mt-1 text-xs text-slate-500">Your job costs for {year} sorted by Schedule C line. A starting point for you or your tax preparer, not tax advice.</p>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {tax.lines.map((line) => (
                      <tr key={line.key} data-testid="tax-line" data-key={line.key} data-amount={line.amount.toFixed(2)} className="border-t border-slate-200/60 align-top transition hover:bg-teal-500/5">
                        <td className="whitespace-nowrap px-2 py-2.5"><span className="inline-block rounded-md bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">{line.line}</span></td>
                        <td className="px-2 py-2.5">{line.label}{line.note && <span className="block text-xs text-slate-500">{line.note}</span>}</td>
                        <td className={cell}>{usd(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 text-base font-bold">
                      <td className="px-2 py-3" colSpan={2}>Total (same as job costs above)</td>
                      <td className={cell}>{usd(tax.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {miles.miles > 0 && <li className="rounded-lg bg-slate-500/5 px-3 py-2" data-testid="tax-miles">🚗 Mileage log: {miles.miles} business miles in {year} (Line 9 if you use the standard mileage rate).</li>}
                {tax.tips > 0 && <li className="rounded-lg bg-slate-500/5 px-3 py-2" data-testid="tax-tips">💵 Tips received: {usd(tax.tips)} (part of gross receipts, Line 1; not in the totals above).</li>}
              </ul>
            </div>
            <section className="rounded-2xl border border-slate-300/60 p-4 text-sm sm:p-5" data-testid="not-covered">
              <h2 className="text-base font-semibold">Not covered here</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                <li>Bank reconciliation: use the QuickBooks / Xero sync in Integrations.</li>
                <li>Balance sheet (assets, loans, owner equity).</li>
                <li>Depreciation schedules for vehicles and equipment: talk to your accountant.</li>
              </ul>
            </section>
          </div>
        )}
        {tab === "export" && (
          <div data-testid="reports-accountant" className="space-y-3 print:hidden">
            <section className={`${CARD} space-y-3`}>
              <h2 className="text-base font-semibold">For your accountant ({year})</h2>
              <p className="text-xs text-slate-500">The .zip has the year&apos;s invoices, payments, expenses (job costs and business expenses), crew receipts and mileage as CSV files, plus a summary with Schedule C lines. Each table on these tabs also has its own CSV button.</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" data-testid="report-export-accountant" onClick={() => {
                let business = "";
                try { business = String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").businessName || ""); } catch { /* ignore */ }
                downloadBytes(`clientready-accountant-${year}.zip`, zipFiles(accountantFiles(documents, crewExpenses, mileage.read(), year, business, bizOcc)));
              }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! transition hover:bg-teal-400">Accountant package (.zip)</button>
              <button type="button" data-testid="report-export-months" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-500/40 px-4 text-sm font-medium text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 dark:text-teal-300" onClick={() => downloadCsv(`report-${year}-months.csv`, csvText(["Month", "Billed", "Collected", "Job costs", "Crew receipts"], [...report.months.map((row) => [MONTHS[row.month], row.billed.toFixed(2), row.collected.toFixed(2), row.jobCosts.toFixed(2), row.crewReceipts.toFixed(2)]), ["Total", report.totals.billed.toFixed(2), report.totals.collected.toFixed(2), report.totals.jobCosts.toFixed(2), report.totals.crewReceipts.toFixed(2)]]))}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>Export months (CSV)</button>
              <button type="button" data-testid="report-export-jobs" disabled={!report.jobs.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-500/40 px-4 text-sm font-medium text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 dark:text-teal-300 disabled:opacity-50" onClick={() => downloadCsv(`report-${year}-jobs.csv`, csvText(["Invoice", "Client", "Date", "Total", "Net", "Job cost", "Profit"], report.jobs.map((job) => [job.number, job.client, (job.jobDate || job.date).slice(0, 10), job.total.toFixed(2), job.net.toFixed(2), job.cost.toFixed(2), job.profit.toFixed(2)])))}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>Export jobs (CSV)</button>
            </div>

              <p className="text-xs text-slate-500">The printable year packet is below: Print / Save PDF prints only the cover page and the packet.</p>
            </section>
          </div>
        )}
        {/* One copy of the Sales and expense log: visible (and printable) on Export; elsewhere it only feeds the totals. */}
        <div hidden={tab !== "export"} data-testid="year-packet-wrap">
          <YearView embedded year={year} onData={setYearData} cover={<Cover year={year} data={yearData} income={income.net} expenses={expensesTotal} net={netProfit} />} />
        </div>
      </div>
    </AppShell>
  );
}

const CARD = "rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5";
const LOADING = "Loading…";

function Stat({ label, value, sub, testid }: { label: string; value: string; sub?: string; testid: string }) {
  return (
    <div className={CARD} data-testid={testid} data-value={value}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Pair({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return <div className="flex justify-between gap-3 rounded-lg bg-slate-500/5 px-3 py-2" data-testid={testid} data-value={value}><dt className="text-slate-600">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>;
}

function MonthChart({ months }: { months: MonthRow[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.billed, m.collected, m.jobCosts]));
  return (
    <div className="mt-3" data-testid="month-chart" aria-label="Billed, collected and job costs by month">
      <div className="flex h-36 items-end gap-1 sm:gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-px">
              <span title={`Billed ${usd(m.billed)}`} className="w-1/3 rounded-t bg-teal-200 dark:bg-teal-800" style={{ height: `${(m.billed / max) * 100}%` }} />
              <span title={`Collected ${usd(m.collected)}`} className="w-1/3 rounded-t bg-teal-500" style={{ height: `${(Math.max(m.collected, 0) / max) * 100}%` }} />
              <span title={`Job costs ${usd(m.jobCosts)}`} className="w-1/3 rounded-t bg-amber-400" style={{ height: `${(m.jobCosts / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-slate-500">{MONTHS[m.month]}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 bg-teal-200" />Billed</span><span><i className="mr-1 inline-block h-2 w-2 bg-teal-500" />Collected</span><span><i className="mr-1 inline-block h-2 w-2 bg-amber-400" />Job costs</span></p>
    </div>
  );
}

function Cover({ year, data, income, expenses, net }: { year: string; data: YearData | null; income: number; expenses: number; net: number }) {
  return (
    <section data-testid="packet-cover" className="mb-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 print:break-after-page print:border-0">
      <p className="text-xs uppercase tracking-widest text-slate-500">Year-end packet</p>
      <h2 className="mt-1 text-2xl font-bold">{data?.businessName || "Your business"} · {year}</h2>
      <p className="text-sm text-slate-600">{data?.taxId ? `EIN ${data.taxId}` : "EIN not on file"} · Prepared {new Date().toLocaleDateString()}</p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-slate-500">Income (collected)</dt><dd className="text-lg font-semibold">{usd(income)}</dd></div>
        <div><dt className="text-slate-500">Expenses</dt><dd className="text-lg font-semibold">{usd(expenses)}</dd></div>
        <div><dt className="text-slate-500">Net profit</dt><dd className="text-lg font-semibold">{usd(net)}</dd></div>
      </dl>
      <p className="mt-4 text-xs text-slate-500">Contents: Sales and expense log, crew pay, deposits, job profit. Made with ClientReady. {DISCLAIMER}</p>
    </section>
  );
}
