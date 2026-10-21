/** A3: after an await, patch only one doc into the latest stored list (never write back a stale snapshot). */
export function patchStoredDoc<T extends { id: string }>(raw: string | null, next: T, fallback: T[]): T[] {
  let latest: T[] = fallback;
  try { const parsed = raw ? JSON.parse(raw) : null; if (Array.isArray(parsed)) latest = parsed; } catch { /* keep fallback */ }
  return latest.some((item) => item.id === next.id) ? latest.map((item) => (item.id === next.id ? next : item)) : [...latest, next];
}
