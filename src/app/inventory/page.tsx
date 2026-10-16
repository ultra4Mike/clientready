"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { newId } from "@/lib/synced-list";
import { adjust, inventory, isLow, qtyOf, stockValue, type Part } from "@/lib/inventory";

const input = "w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base outline-none sm:text-sm min-h-11 mt-1 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";
const blank = { name: "", qty: "", unit: "ea", cost: "", low: "" };

/** Owner-only (AppShell sends crew accounts to /crew). Parts on hand, low-stock flags, stock value. */
export default function InventoryPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setParts(inventory.read()));
    void inventory.sync().then(setParts);
  }, []);
  const sorted = [...parts].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name));
  const shown = lowOnly ? sorted.filter(isLow) : sorted;
  const lowCount = parts.filter(isLow).length;

  function add() {
    if (!form.name.trim()) return setError("Enter a part name.");
    setError("");
    const same = parts.find((part) => part.name.trim().toLowerCase() === form.name.trim().toLowerCase());
    setParts(inventory.upsert({ ...(same || {}), id: same?.id || newId("part"), ...form, name: form.name.trim(), qty: form.qty || "0" }));
    setForm(blank);
  }
  const save = (part: Part) => setParts(inventory.upsert(part));

  return (
    <AppShell title="Inventory" showTitle={false}>
      <PageHeader title="Parts inventory" subtitle={<>Stock value ${stockValue(parts).toFixed(2)}{lowCount ? <span data-testid="inventory-low-count" className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 cr-tone-warn"> · {lowCount} low</span> : null}</>} actions={
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="lowOnly" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only</label>} />
      <div className="space-y-5">
        <div className="grid gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:grid-cols-6 sm:p-5" data-testid="inventory-form">
          <label className="text-sm sm:col-span-2">Part<input name="name" className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-sm">On hand<input name="qty" inputMode="decimal" className={input} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></label>
          <label className="text-sm">Unit cost<input name="cost" inputMode="decimal" className={input} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
          <label className="text-sm">Warn at<input name="low" inputMode="decimal" placeholder="e.g. 2" className={input} value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} /></label>
          <button type="button" data-testid="inventory-add" onClick={add} className="min-h-11 self-end rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Add / update</button>
          {error && <p className="text-sm text-red-600 sm:col-span-6">{error}</p>}
        </div>
        {shown.length === 0 ? <EmptyState icon="🔧" title={lowOnly ? "Nothing is low." : "No parts yet."} /> : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {shown.map((part) => (
              <li key={part.id} data-testid={`part-${part.id}`} data-low={isLow(part) ? "1" : undefined} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="font-medium">{part.name}</span>{part.cost ? ` · $${Number(part.cost).toFixed(2)}/${part.unit || "ea"}` : ""}{isLow(part) && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">Low</span>}</span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`One less ${part.name}`} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-lg font-semibold transition hover:border-teal-500" onClick={() => save(adjust(part, -1))}>−</button>
                  <span className="w-12 text-center text-base font-semibold tabular-nums" data-testid="part-qty">{qtyOf(part)}</span>
                  <button type="button" aria-label={`One more ${part.name}`} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-lg font-semibold transition hover:border-teal-500" onClick={() => save(adjust(part, 1))}>+</button>
                  <button type="button" aria-label={`Delete ${part.name}`} className="min-h-11 rounded-lg px-3 text-sm text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300" onClick={() => window.confirm(`Delete ${part.name}?`) && setParts(inventory.remove(part.id))}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
