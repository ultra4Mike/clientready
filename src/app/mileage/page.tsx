"use client";

import { useEffect, useState } from "react";
import FormDraft from "@/components/FormDraft";
import { clearDraft, draftKey } from "@/lib/drafts";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { newId } from "@/lib/synced-list";
import { addedMiles, mileage, mileageCsv, milesOf, totalMiles, type Trip } from "@/lib/mileage";
import { periodRange } from "@/lib/period";

const input = "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base outline-none sm:text-sm min-h-11 mt-1 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Owner-only (AppShell sends crew accounts to /crew). */
export default function MileagePage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [form, setForm] = useState({ date: "", miles: "", from: "", to: "", purpose: "" });
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => { setTrips(mileage.read()); setYear(String(new Date().getFullYear())); setForm((f) => ({ ...f, date: today() })); });
    void mileage.sync().then(setTrips);
  }, []);
  const years = [...new Set([year, ...trips.map((trip) => trip.date.slice(0, 4))].filter(Boolean))].sort().reverse();
  const shown = trips.filter((trip) => trip.date.startsWith(year)).sort((a, b) => b.date.localeCompare(a.date));

  function add() {
    if (!form.date || !(Number(form.miles) > 0)) return setError("Enter a date and the miles driven.");
    setError("");
    setTrips(mileage.upsert({ id: newId("trip"), ...form }));
    setForm({ date: form.date, miles: "", from: form.to, to: "", purpose: "" });
  }
  const [quick, setQuick] = useState({ day: "", week: "" });
  const [quickNote, setQuickNote] = useState("");
  /** Quick total for today or this week (Mon-Sun). One per day/week; saving again replaces it. Only miles not already logged count. */
  function addQuick(kind: "daily" | "weekly") {
    const value = kind === "daily" ? quick.day : quick.week;
    if (!(Number(value) > 0)) return setQuickNote("Enter the total miles.");
    const { from, to } = periodRange(kind === "daily" ? "day" : "week");
    const row: Trip = { id: `${kind}-${from}`, date: from, ...(kind === "weekly" ? { until: to } : {}), miles: String(Number(value)), from: "", to: "", purpose: kind === "daily" ? "Daily total" : "Weekly total", source: kind };
    const next = mileage.upsert(row);
    setTrips(next);
    const saved = next.find((trip) => trip.id === row.id)!;
    const add = addedMiles(saved, next);
    const covered = Math.round((Number(value) - add) * 10) / 10;
    setQuickNote(covered > 0 ? `${covered} mi were already logged (invoices or trips), so this adds ${add} mi.` : `Added ${add} mi.`);
    setQuick({ day: "", week: "" });
    void mileage.sync().catch(() => {});
  }
  function download() {
    const url = URL.createObjectURL(new Blob([mileageCsv(shown)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `mileage-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Mileage" showTitle={false}>
      <PageHeader title="Mileage log" subtitle="Business miles for your records and taxes. Synced to your account." actions={
        <div className="flex items-center gap-2">
          <select aria-label="Year" name="year" className={input} value={year} onChange={(event) => setYear(event.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <button type="button" data-testid="mileage-csv" disabled={!shown.length} onClick={download} className="min-h-11 whitespace-nowrap rounded-lg border border-teal-500/40 px-3 text-sm font-medium disabled:opacity-50">Download CSV</button>
        </div>} />
      <FormDraft form="mileage" value={{ miles: form.miles, to: form.to, purpose: form.purpose }} blank={{ miles: "", to: "", purpose: "" }} onRestore={(v) => setForm((f) => ({ ...f, ...v }))} what="trip" />
      <div className="space-y-5">
        <div className="grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:grid-cols-6 sm:p-5" data-testid="mileage-form">
          <label className="text-sm">Date<input type="date" name="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="text-sm">Miles<input name="miles" inputMode="decimal" className={input} value={form.miles} onChange={(e) => setForm({ ...form, miles: e.target.value })} /></label>
          <label className="text-sm">From<input name="from" className={input} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
          <label className="text-sm">To<input name="to" className={input} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          <label className="text-sm">Purpose<input name="purpose" placeholder="Job, supply run…" className={input} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
          <button type="button" data-testid="mileage-add" onClick={add} className="min-h-11 self-end rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Add trip</button>
          {error && <p role="alert" className="text-sm text-red-600 sm:col-span-6">{error}</p>}
        </div>
        <div className="grid gap-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:grid-cols-2 sm:p-5" data-testid="mileage-quick">
          <div>
            <label className="block text-sm font-medium text-[var(--cr-muted)]">Total miles today<input name="milesToday" data-testid="mileage-today" inputMode="decimal" className={input} value={quick.day} onChange={(e) => setQuick({ ...quick, day: e.target.value })} /></label>
            <button type="button" data-testid="mileage-today-add" onClick={() => addQuick("daily")} className="mt-2 min-h-11 w-full rounded-lg border border-teal-500/50 px-4 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 sm:w-auto dark:text-teal-300">Save today&apos;s total</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--cr-muted)]">Total miles this week<input name="milesWeek" data-testid="mileage-week" inputMode="decimal" className={input} value={quick.week} onChange={(e) => setQuick({ ...quick, week: e.target.value })} /></label>
            <button type="button" data-testid="mileage-week-add" onClick={() => addQuick("weekly")} className="mt-2 min-h-11 w-full rounded-lg border border-teal-500/50 px-4 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 sm:w-auto dark:text-teal-300">Save this week&apos;s total</button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-2">A total counts only miles not already logged that day or week (invoice miles and trips), so nothing is counted twice. Saving again replaces it.</p>
          {quickNote && <p role="status" className="text-sm sm:col-span-2" data-testid="mileage-quick-note">{quickNote}</p>}
        </div>
        <p className="text-lg font-semibold" data-testid="mileage-total">{year}: {totalMiles(trips, year)} miles</p>
        {shown.length === 0 ? <EmptyState icon="🚗" title="No trips logged for this year." /> : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {shown.map((trip) => (
              <li key={trip.id} data-testid={`trip-${trip.id}`} data-source={trip.source || "trip"} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium tabular-nums">{trip.date}{trip.until ? `–${trip.until}` : ""}</span> · {trip.source === "daily" || trip.source === "weekly" ? `${milesOf(trip)} mi total, adds ${addedMiles(trip, trips)} mi` : `${milesOf(trip)} mi`}{trip.source === "invoice" ? <span className="ml-1 rounded-full border border-teal-500/30 px-2 py-0.5 text-xs text-teal-700 dark:text-teal-300" data-testid="trip-from-invoice"> · from invoice</span> : null}{trip.from || trip.to ? ` · ${trip.from || "?"} → ${trip.to || "?"}` : ""}{trip.purpose ? ` · ${trip.purpose}` : ""}</span>
                <button type="button" aria-label={`Delete trip on ${trip.date}`} className="min-h-11 px-2 text-slate-500" onClick={() => window.confirm("Delete this trip?") && setTrips(mileage.remove(trip.id))}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
