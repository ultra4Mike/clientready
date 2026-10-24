/** R96/R98: Stripe money helpers (pure). */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
export const isZeroDecimal = (currency: string) => ZERO_DECIMAL.has(String(currency || "").toLowerCase());
/** Dollars -> integer cents without float drift (1.005 -> 101, 0.29 -> 29). */
export function toCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Number((value * 100).toPrecision(12)));
}
/** Stripe minor units -> major units for the given currency. */
export function fromMinor(amount: number, currency: string) {
  return isZeroDecimal(currency) ? amount : amount / 100;
}
/** The only currency invoices are charged in (the app's totals are in that currency). */
export function currencyOk(sessionCurrency: unknown, configured: string) {
  const c = String(sessionCurrency || "").toLowerCase();
  return Boolean(c) && c === configured.toLowerCase() && c === "usd";
}
/** Major units -> Stripe minor units for the given currency (JPY 500 -> 500, USD 5.25 -> 525). */
export function toMinor(value: number, currency: string) {
  if (!Number.isFinite(value)) return 0;
  return isZeroDecimal(currency) ? Math.round(value) : toCents(value);
}
/**
 * QA2: strict money input. Accepts "500", "1,234.56", "$12.50"; rejects negatives, exponents ("5e2"),
 * bad thousands groups ("1,23"), more decimals than the currency has, and anything else. Returns null when invalid.
 */
export function parseMoneyInput(raw: unknown, currency = "usd"): number | null {
  if (typeof raw === "number") raw = String(raw);
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^\$\s*/, "");
  const decimals = isZeroDecimal(currency) ? 0 : 2;
  const frac = decimals ? `(?:\\.\\d{1,${decimals}})?` : "";
  const re = new RegExp(`^(?:\\d{1,3}(?:,\\d{3})+|\\d+)${frac}$`);
  if (!re.test(s)) return null;
  const value = Number(s.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
