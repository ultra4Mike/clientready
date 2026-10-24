"use client";

import { useMemo, useState, type ReactNode } from "react";
import { csvText, downloadCsv } from "@/lib/csv";
import { filterRows, sortRows, type Col, type Filters } from "@/lib/table-filter";

/**
 * One table look for Reports & Taxes: click a header to sort, filter by date range, text and the
 * columns marked `filter` (client, job, category / Schedule C line, payment method), and export
 * exactly the rows shown as CSV. Mobile: scrolls sideways; the filters wrap.
 */
export type DataCol<T> = Col<T> & { render?: (row: T) => ReactNode; className?: string };

export default function DataTable<T>(props: {
  testid: string; columns: DataCol<T>[]; rows: T[]; csvName: string; empty: string; rowTestId?: string;
  rowAttrs?: (row: T) => Record<string, string>; footer?: (shown: T[]) => ReactNode; initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const { columns, rows } = props;
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", q: "", pick: {} });
  const [sort, setSort] = useState(props.initialSort || { key: "", dir: "asc" as "asc" | "desc" });
  const shown = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort), [rows, columns, filters, sort]);
  const hasDate = columns.some((c) => c.type === "date");
  const pickCols = columns.filter((c) => c.filter);
  const field = "min-h-10 rounded-lg border border-teal-500/30 bg-transparent px-2 text-sm";
  const options = (c: DataCol<T>) => [...new Set(rows.map((r) => String(c.value(r) ?? "")).filter(Boolean))].sort();
  const active = filters.from || filters.to || filters.q || Object.values(filters.pick).some(Boolean);
  return (
    <div data-testid={props.testid} data-rows={shown.length}>
      <div className="mb-2 flex flex-wrap items-end gap-2 print:hidden" data-testid={`${props.testid}-filters`}>
        {hasDate && <label className="flex flex-col text-xs text-slate-500">From<input type="date" aria-label="From date" className={field} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>}
        {hasDate && <label className="flex flex-col text-xs text-slate-500">To<input type="date" aria-label="To date" className={field} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>}
        {pickCols.map((c) => (
          <label key={c.key} className="flex flex-col text-xs text-slate-500">{c.label}
            <select aria-label={`Filter ${c.label}`} data-testid={`${props.testid}-filter-${c.key}`} className={field} value={filters.pick[c.key] || ""} onChange={(e) => setFilters({ ...filters, pick: { ...filters.pick, [c.key]: e.target.value } })}>
              <option value="">All</option>{options(c).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
        <label className="flex flex-col text-xs text-slate-500">Search<input aria-label="Search table" className={field} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
        {active && <button type="button" className="min-h-10 rounded-lg px-2 text-sm text-teal-700 underline dark:text-teal-300" onClick={() => setFilters({ from: "", to: "", q: "", pick: {} })}>Clear</button>}
        <button type="button" data-testid={`${props.testid}-csv`} disabled={!shown.length} className="ml-auto min-h-10 rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 disabled:opacity-50 dark:text-teal-300" onClick={() => downloadCsv(props.csvName, csvText(columns.map((c) => c.label), shown.map((r) => columns.map((c) => { const v = c.value(r); return typeof v === "number" ? (c.type === "money" ? v.toFixed(2) : String(v)) : String(v ?? ""); }))))}>CSV</button>
      </div>
      {shown.length === 0 ? <p className="py-2 text-sm text-slate-500">{rows.length ? "No rows match these filters." : props.empty}</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 dark:border-teal-500/15">
          <table className="w-full text-sm">
            <thead className="bg-slate-500/5 text-xs text-slate-500">
              <tr>{columns.map((c) => {
                const right = c.type === "money" || c.type === "number";
                const on = sort.key === c.key;
                return <th key={c.key} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-2 py-2 ${right ? "text-right" : "text-left"}`}><button type="button" className="font-semibold hover:text-teal-600" onClick={() => setSort({ key: c.key, dir: on && sort.dir === "asc" ? "desc" : "asc" })}>{c.label}{on ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>;
              })}</tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} data-testid={props.rowTestId} {...(props.rowAttrs ? props.rowAttrs(r) : {})} className="border-t border-slate-200/60 align-top">
                  {columns.map((c) => {
                    const right = c.type === "money" || c.type === "number";
                    const v = c.value(r);
                    return <td key={c.key} className={`px-2 py-1.5 ${right ? "text-right tabular-nums" : ""} ${c.className || ""}`}>{c.render ? c.render(r) : c.type === "money" ? usd(Number(v)) : String(v ?? "")}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            {props.footer && <tfoot>{props.footer(shown)}</tfoot>}
          </table>
        </div>
      )}
    </div>
  );
}

export const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
