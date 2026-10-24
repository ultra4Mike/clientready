"use client";

import { useState } from "react";
import { BIZ_CATEGORIES, bizExpenses, categoryOf, type BizExpense, type BizOccurrence } from "@/lib/business-expenses";
import { paymentMethods } from "@/lib/payments";
import { newId } from "@/lib/synced-list";
import { localYmd } from "@/lib/scheduled-jobs";
import DataTable from "@/components/reports/DataTable";

/** Shrinks a receipt photo to a small JPEG so it fits in the synced list. */
async function smallPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const scale = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.6);
  } finally { URL.revokeObjectURL(url); }
}

const blank = (): Omit<BizExpense, "updatedAt"> => ({ id: newId("bx"), date: localYmd(), vendor: "", amount: "", category: "office", method: "Card", note: "", monthly: false });

export default function BusinessExpenses({ list, occurrences, year, onChange }: { list: BizExpense[]; occurrences: BizOccurrence[]; year: string; onChange: (list: BizExpense[]) => void }) {
  const [draft, setDraft] = useState(blank());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const field = "min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm";
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !(Number(draft.amount) > 0) || !draft.vendor.trim()) return setError("Add a date, a vendor and an amount above $0.");
    setError("");
    onChange(bizExpenses.upsert({ ...draft, vendor: draft.vendor.trim(), amount: Number(draft.amount).toFixed(2) }));
    setDraft(blank()); setOpen(false);
  };
  const cat = categoryOf(draft.category);
  return (
    <section className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5" data-testid="biz-expenses">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Business expenses (not on a job)</h2>
          <p className="text-xs text-slate-500">Rent, insurance, phone, software, vehicle, equipment, office, advertising, professional fees… Synced to your account.</p>
        </div>
        <button type="button" data-testid="biz-add" onClick={() => setOpen(!open)} className="min-h-11 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950!">{open ? "Close" : "Add expense"}</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="biz-form">
          <label className="text-xs text-slate-500">Date<input type="date" data-testid="biz-date" className={field} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Vendor<input data-testid="biz-vendor" className={field} value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Amount ($)<input inputMode="decimal" data-testid="biz-amount" className={field} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^0-9.]/g, "") })} /></label>
          <label className="text-xs text-slate-500">Schedule C category<select data-testid="biz-category" className={field} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{BIZ_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.line})</option>)}</select></label>
          <label className="text-xs text-slate-500">Payment method<select data-testid="biz-method" className={field} value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="text-xs text-slate-500 sm:col-span-2">Note<input data-testid="biz-note" className={field} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Receipt photo (optional)<input type="file" accept="image/*" data-testid="biz-receipt" className="mt-1 block w-full text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setDraft({ ...draft, receipt: await smallPhoto(f) }); }} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="biz-monthly" checked={Boolean(draft.monthly)} onChange={(e) => setDraft({ ...draft, monthly: e.target.checked })} /> Repeats monthly</label>
          {draft.monthly && <label className="text-xs text-slate-500">Ends (optional)<input type="date" className={field} value={draft.until || ""} onChange={(e) => setDraft({ ...draft, until: e.target.value })} /></label>}
          {cat.unsure && <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-4">{cat.line}: {cat.unsure}</p>}
          {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2 lg:col-span-4">{error}</p>}
          <div className="sm:col-span-2 lg:col-span-4"><button type="button" data-testid="biz-save" onClick={save} className="min-h-11 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950!">Save expense</button></div>
        </div>
      )}
      <div className="mt-3">
        <DataTable<BizOccurrence> testid="biz-table" rowTestId="biz-row" rowAttrs={(o) => ({ "data-amount": o.amount.toFixed(2), "data-line": o.line })} csvName={`business-expenses-${year}.csv`} empty={`No business expenses in ${year} yet.`} rows={occurrences} initialSort={{ key: "date", dir: "desc" }}
          columns={[
            { key: "date", label: "Date", type: "date", value: (o) => o.date },
            { key: "vendor", label: "Vendor", value: (o) => o.vendor, filter: true },
            { key: "category", label: "Category", value: (o) => o.categoryLabel, filter: true },
            { key: "line", label: "Schedule C line", value: (o) => o.line, filter: true },
            { key: "method", label: "Payment method", value: (o) => o.method, filter: true },
            { key: "amount", label: "Amount", type: "money", value: (o) => o.amount },
            { key: "more", label: "Notes", value: (o) => [o.monthly ? "monthly" : "", o.receipt ? "receipt" : "", o.note].filter(Boolean).join(" · "), render: (o) => <span className="text-xs text-slate-500">{o.monthly && "🔁 monthly "}{o.receipt && "📎 receipt "}{o.note}<button type="button" className="ml-2 text-rose-700 underline print:hidden" onClick={() => { if (window.confirm(o.monthly ? "Delete this monthly expense (every month)?" : "Delete this expense?")) onChange(bizExpenses.remove(o.entryId)); }}>Delete</button></span> },
          ]}
          footer={(shown) => <tr className="border-t border-slate-300 font-semibold"><td className="px-2 py-1.5" colSpan={5}>Total shown</td><td className="px-2 py-1.5 text-right tabular-nums">${shown.reduce((s, o) => s + o.amount, 0).toFixed(2)}</td><td /></tr>} />
      </div>
      {list.length > 0 && <p className="mt-1 text-xs text-slate-500">{list.length} saved entr{list.length === 1 ? "y" : "ies"}; monthly ones repeat up to today.</p>}
    </section>
  );
}
