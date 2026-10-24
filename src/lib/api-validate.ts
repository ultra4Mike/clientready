/** QA2 (R74): request checks for the public REST API that run before the database call. */
const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
/** A usable ?since= value: an ISO date or date-time that really exists (no "yesterday", no 2026-13-45). */
export function validSince(value: string) {
  const v = value.trim();
  if (!ISO.test(v)) return false;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) return false;
  return Number.isFinite(Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v.replace(" ", "T")));
}
const NUM = /^\d+(?:\.\d+)?$/;
/** Items must have qty and rate that are plain non-negative numbers (qty > 0). Returns an error message or "". */
export function itemsError(items: unknown) {
  if (items === undefined) return "";
  if (!Array.isArray(items)) return "items must be an array of {description, qty, rate}.";
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return "Each item must be an object.";
    const { qty, rate } = item as { qty?: unknown; rate?: unknown };
    const q = qty === undefined || qty === null ? "1" : String(qty).trim();
    const r = rate === undefined || rate === null ? "0" : String(rate).trim();
    if (!NUM.test(q) || !NUM.test(r)) return "Each item needs qty and rate as non-negative numbers (no minus signs).";
    if (!(Number(q) > 0)) return "Each item's qty must be more than 0.";
  }
  return "";
}
