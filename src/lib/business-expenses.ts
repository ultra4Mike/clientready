/**
 * Business expenses: overhead not tied to a job (rent, insurance, phone, software…). Stored like the
 * mileage log: this device + one jsonb column on the owner's profile (profiles.business_expenses).
 * A "monthly" entry repeats on the same day each month from its date (until its end date, if set).
 */
import { syncedList, type SyncedRow } from "@/lib/synced-list";

export type BizExpense = SyncedRow & { date: string; vendor: string; amount: string; category: string; method: string; note: string; receipt?: string; monthly?: boolean; until?: string };
export const BIZ_EXPENSES_KEY = "clientready-business-expenses";
export const bizExpenses = syncedList<BizExpense>(BIZ_EXPENSES_KEY, "business_expenses");

/** Schedule C line for each category. Lines marked `unsure` are reported for review. */
export const BIZ_CATEGORIES: { key: string; label: string; line: string; unsure?: string }[] = [
  { key: "advertising", label: "Advertising", line: "Line 8" },
  { key: "vehicle", label: "Vehicle (actual costs, not mileage)", line: "Line 9", unsure: "Only if you use actual expenses, not the standard mileage rate." },
  { key: "commissions", label: "Commissions and fees", line: "Line 10" },
  { key: "contract", label: "Contract labor (not job crew)", line: "Line 11" },
  { key: "equipment", label: "Equipment / tools (big purchases)", line: "Line 13", unsure: "Usually depreciated or expensed under Section 179 on Form 4562; your accountant decides." },
  { key: "insurance", label: "Insurance (not health)", line: "Line 15" },
  { key: "interest", label: "Interest (business loans, cards)", line: "Line 16b" },
  { key: "professional", label: "Legal and professional fees", line: "Line 17" },
  { key: "office", label: "Office expense", line: "Line 18" },
  { key: "rent-equipment", label: "Rent: vehicles, machinery, equipment", line: "Line 20a" },
  { key: "rent", label: "Rent: shop, office, storage", line: "Line 20b" },
  { key: "repairs", label: "Repairs and maintenance", line: "Line 21" },
  { key: "supplies", label: "Supplies (not on a job)", line: "Line 22" },
  { key: "licenses", label: "Taxes and licenses", line: "Line 23" },
  { key: "travel", label: "Travel", line: "Line 24a" },
  { key: "meals", label: "Meals", line: "Line 24b", unsure: "Usually only 50% is deductible." },
  { key: "utilities", label: "Utilities", line: "Line 25" },
  { key: "phone", label: "Phone and internet", line: "Line 25", unsure: "Some preparers put phone/internet on Line 27a; only the business share counts." },
  { key: "software", label: "Software and subscriptions", line: "Line 27a", unsure: "Some preparers use Line 18 Office expense." },
  { key: "other", label: "Other", line: "Line 27a" },
];
export const categoryOf = (key: string) => BIZ_CATEGORIES.find((c) => c.key === key) || BIZ_CATEGORIES[BIZ_CATEGORIES.length - 1];

const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type BizOccurrence = { id: string; entryId: string; date: string; vendor: string; amount: number; category: string; categoryLabel: string; line: string; method: string; note: string; receipt: boolean; monthly: boolean };

/** Every dated amount in the year (monthly entries repeat until their end date, the year end, or `today`). */
export function bizOccurrences(list: BizExpense[], year: string, today = new Date().toISOString().slice(0, 10)): BizOccurrence[] {
  const out: BizOccurrence[] = [];
  for (const e of list) {
    if (e.deleted || !/^\d{4}-\d{2}-\d{2}/.test(e.date || "") || !(num(e.amount) > 0)) continue;
    const cat = categoryOf(e.category);
    const base = { entryId: e.id, vendor: e.vendor || "", amount: r2(num(e.amount)), category: cat.key, categoryLabel: cat.label, line: cat.line, method: e.method || "", note: e.note || "", receipt: Boolean(e.receipt), monthly: Boolean(e.monthly) };
    if (!e.monthly) { if (e.date.startsWith(year)) out.push({ ...base, id: e.id, date: e.date.slice(0, 10) }); continue; }
    const [y0, m0, d0] = e.date.slice(0, 10).split("-").map(Number);
    const stop = [e.until || "9999-12-31", `${year}-12-31`, today].sort()[0];
    for (let i = 0; i < 600; i++) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const date = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d0, last)).padStart(2, "0")}`;
      if (date > stop) break;
      if (date.startsWith(year)) out.push({ ...base, id: `${e.id}@${date}`, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Totals per Schedule C line, in line order. */
export function bizByLine(occ: BizOccurrence[]) {
  const map = new Map<string, number>();
  for (const o of occ) map.set(o.line, (map.get(o.line) || 0) + o.amount);
  const order = (l: string) => { const m = l.match(/(\d+)([ab]?)/); return m ? Number(m[1]) * 10 + (m[2] === "b" ? 2 : m[2] === "a" ? 1 : 0) : 999; };
  return [...map.entries()].map(([line, amount]) => ({ line, amount: r2(amount) })).sort((a, b) => order(a.line) - order(b.line));
}
