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
