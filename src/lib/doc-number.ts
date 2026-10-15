/** "1003", "#1003", "INV-1003", "PROP 1003" → "1003". Null when the search isn't a document number. */
export function numberQuery(query: string) {
  const match = query.trim().toLowerCase().match(/^(?:[a-z]{1,8}\s*[-#]?\s*)?#?0*(\d+)$/);
  return match ? match[1] : null;
}

/** Digits of a saved number ("INV-01003" → "1003"). */
export function numberDigits(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits;
}

/**
 * Filters a list by a search box. When the search looks like a document number and some document
 * has exactly that number (any prefix), only those are kept; otherwise the normal text match is used
 * (so a search like "2026" still finds dates).
 */
export function searchWithNumbers<T>(list: T[], query: string, numberOf: (item: T) => unknown, textMatch: (item: T) => boolean) {
  const wanted = numberQuery(query);
  if (wanted) {
    const hits = list.filter((item) => numberDigits(numberOf(item)) === wanted);
    // "PROP-1003" prefers PROP-1003 over INV-1003 when both exist.
    const prefix = (query.trim().toLowerCase().match(/^[a-z]+/) || [""])[0];
    const exact = prefix ? hits.filter((item) => String(numberOf(item) || "").toLowerCase().startsWith(prefix)) : [];
    if (exact.length) return exact;
    if (hits.length) return hits;
  }
  return list.filter(textMatch);
}
