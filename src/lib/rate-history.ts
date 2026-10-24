// QA4: effective-dated pay rates. A raise applies only to hours on/after its effective date; a future raise never changes
// current pay; an approved day keeps the rate known when it was approved (entries set later don't reprice it).
export type RateChange = { rate: string; effectiveDate: string; setAt?: string };
type Rated = { rate?: string; rateHistory?: RateChange[] | unknown };

const hist = (w: Rated): RateChange[] => (Array.isArray(w.rateHistory) ? (w.rateHistory as RateChange[]) : [])
  .filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(String(h.effectiveDate || "")) && String(h.rate ?? "").trim() !== "");

/**
 * The rate for work on `date`. `asOf` (ISO time, e.g. approvedAt) ignores history entries set after it (freeze).
 * Before the earliest entry, the base rate is the earliest entry's `from` base (stored at first raise) or `w.rate`.
 */
export function rateOn(w: Rated, date: string, asOf?: string): string {
  const all = hist(w).filter((h) => !asOf || !h.setAt || h.setAt <= asOf).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || String(a.setAt || "").localeCompare(String(b.setAt || "")));
  let pick: RateChange | undefined;
  for (const h of all) if (h.effectiveDate <= date) pick = h;
  return pick ? pick.rate : String(w.rate ?? "");
}

/** Add a raise. The first raise stores the current rate as the base (from 0000-01-01) so earlier hours keep it. */
export function addRaise<T extends Rated>(w: T, rate: string, effectiveDate: string, today: string, now = new Date().toISOString()): T & { rate: string; rateHistory: RateChange[] } {
  const h = hist(w);
  const base = h.length ? h : String(w.rate ?? "").trim() ? [{ rate: String(w.rate), effectiveDate: "0000-01-01", setAt: "" }] : [];
  const rateHistory = [...base, { rate, effectiveDate, setAt: now }];
  const next = { ...w, rateHistory, rate: "" } as T & { rate: string; rateHistory: RateChange[] };
  next.rate = rateOn(next, today) || rate; // current pay only moves when the raise has started
  return next;
}

/** The rate shown/used today (catches up a raise whose date has passed). */
export const currentRate = (w: Rated, today: string) => (hist(w).length ? rateOn(w, today) : String(w.rate ?? ""));
