"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";
import { buildReport, MONTHS, reportYears } from "@/lib/reports";
import { csvText, downloadCsv } from "@/lib/csv";
import { accountantFiles } from "@/lib/accountant-export";
import { downloadBytes, zipFiles } from "@/lib/zip";
import { taxCategories } from "@/lib/tax-categories";
import { bestCustomers, type CustomerSort } from "@/lib/best-customers";
import { mileage, totalMiles } from "@/lib/mileage";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
type CrewExpense = { amount?: unknown; created_at?: string; kind?: string; note?: string; worker_name?: string; doc_id?: string };

const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;

/** Owner-only (AppShell sends crew accounts to /crew). Reads the local cache; never changes anything. */
export default function ReportsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [crewExpenses, setCrewExpenses] = useState<CrewExpense[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    // Read after mount so the static render and the first client render match.
    Promise.resolve().then(() => {
      try {
        setDocuments(JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"));
      } catch {
        setDocuments([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      supabase.from("crew_expenses").select("amount, created_at, kind, note, worker_name, doc_id").then(({ data: rows, error }) => {
        if (!error && rows) setCrewExpenses(rows as CrewExpense[]);
      });
    });
  }, []);

  const years = useMemo(() => reportYears(documents), [documents]);
  const report = useMemo(() => buildReport(documents, crewExpenses, year), [documents, crewExpenses, year]);
  const tax = useMemo(() => taxCategories(documents, year), [documents, year]);
  const [customerSort, setCustomerSort] = useState<CustomerSort>("profit");
  const customers = useMemo(() => bestCustomers(documents, year, customerSort), [documents, year, customerSort]);
  const [miles, setMiles] = useState(0);
  useEffect(() => { Promise.resolve().then(() => setMiles(totalMiles(mileage.read(), year))); }, [year, documents]);
  const cell = "px-2 py-1.5 text-right tabular-nums";

  return (
    <AppShell title="Reports">
      <PageHeader title="Reports" subtitle="Billed, collected, costs and job profit by month." />
      <div data-testid="reports" data-year={year} className="space-y-6">
        <label className="flex items-center gap-2 text-sm">
          Year
          <select data-testid="report-year" value={year} onChange={(event) => setYear(event.target.value)} className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-sm">
            {years.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" data-testid="report-export-accountant" onClick={() => {
            let business = "";
            try { business = String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").businessName || ""); } catch { /* ignore */ }
            downloadBytes(`clientready-accountant-${year}.zip`, zipFiles(accountantFiles(documents, crewExpenses, mileage.read(), year, business)));
          }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! transition hover:bg-teal-400">Accountant package (.zip)</button>
          <button type="button" data-testid="report-export-months" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-500/40 px-4 text-sm font-medium text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 dark:text-teal-300" onClick={() => downloadCsv(`report-${year}-months.csv`, csvText(["Month", "Billed", "Collected", "Job costs", "Crew receipts"], [...report.months.map((row) => [MONTHS[row.month], row.billed.toFixed(2), row.collected.toFixed(2), row.jobCosts.toFixed(2), row.crewReceipts.toFixed(2)]), ["Total", report.totals.billed.toFixed(2), report.totals.collected.toFixed(2), report.totals.jobCosts.toFixed(2), report.totals.crewReceipts.toFixed(2)]]))}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>Export months (CSV)</button>
          <button type="button" data-testid="report-export-jobs" disabled={!report.jobs.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-500/40 px-4 text-sm font-medium text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 dark:text-teal-300 disabled:opacity-50" onClick={() => downloadCsv(`report-${year}-jobs.csv`, csvText(["Invoice", "Client", "Date", "Total", "Job cost", "Profit"], report.jobs.map((job) => [job.number, job.client, job.date.slice(0, 10), job.total.toFixed(2), job.cost.toFixed(2), job.profit.toFixed(2)])))}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>Export jobs (CSV)</button>
        </div>

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
                  <td className={cell}>{usd(row.crewReceipts)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="report-total" data-billed={report.totals.billed.toFixed(2)} data-collected={report.totals.collected.toFixed(2)} data-job-costs={report.totals.jobCosts.toFixed(2)} data-crew-receipts={report.totals.crewReceipts.toFixed(2)} className="border-t border-slate-300 font-semibold">
                <td className="px-2 py-1.5">Total</td>
                <td className={cell}>{usd(report.totals.billed)}</td>
                <td className={cell}>{usd(report.totals.collected)}</td>
                <td className={cell}>{usd(report.totals.jobCosts)}</td>
                <td className={cell}>{usd(report.totals.crewReceipts)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-1 text-xs text-slate-500">Collected counts payments by the date received. Crew receipts are shown for your records and not added to job costs.</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold">Profit by job</h2>
          {report.jobs.length === 0 && <p data-testid="report-jobs-empty" className="mt-2 text-sm text-slate-500">No invoices sent in {year}.</p>}
          {report.jobs.length > 0 && (
            <div className="overflow-x-auto">
              <table data-testid="report-jobs" data-profit={report.totals.profit.toFixed(2)} className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="px-2 py-1.5 text-left">Job</th>
                    <th className="px-2 py-1.5 text-left">Client</th>
                    <th className={cell}>Invoice total</th>
                    <th className={cell}>Job cost</th>
                    <th className={cell}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {report.jobs.map((job) => (
                    <tr key={job.id} data-testid="report-job" data-id={job.id} data-total={job.total.toFixed(2)} data-cost={job.cost.toFixed(2)} data-profit={job.profit.toFixed(2)} className="border-t border-slate-200/60">
                      <td className="px-2 py-1.5"><Link href={`/invoice?id=${encodeURIComponent(job.id)}`} className="text-teal-600 hover:underline">{job.number}</Link> <span className="text-xs text-slate-500">{MONTHS[job.month]}</span></td>
                      <td className="px-2 py-1.5">{job.client}</td>
                      <td className={cell}>{usd(job.total)}</td>
                      <td className={cell}>{usd(job.cost)}</td>
                      <td className={cell}>{usd(job.profit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-semibold">
                    <td className="px-2 py-1.5" colSpan={4}>Total profit</td>
                    <td className={cell}>{usd(report.totals.profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5" data-testid="tax-categories" data-total={tax.total.toFixed(2)}>
          <h2 className="text-base font-semibold">Tax categories (Schedule C)</h2>
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
            {miles > 0 && <li className="rounded-lg bg-slate-500/5 px-3 py-2" data-testid="tax-miles">🚗 Mileage log: {miles} business miles in {year} (Line 9 if you use the standard mileage rate).</li>}
            {tax.tips > 0 && <li className="rounded-lg bg-slate-500/5 px-3 py-2" data-testid="tax-tips">💵 Tips received: {usd(tax.tips)} (part of gross receipts, Line 1; not in the totals above).</li>}
          </ul>
        </div>
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
    </AppShell>
  );
}
