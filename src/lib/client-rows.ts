/**
 * One mapping from a cloud clients row to the local cache shape, used by every page that refreshes
 * "clientready-clients". Keeps every field (notes, next visit, updated_at baseline, preferences) so no page
 * drops what another page relies on. Before migration 20261016060000 there is no preferences column:
 * the value this device already has is kept.
 */
export type CachedClient = {
  id: string; name: string; company: string; email: string; phone: string; address: string;
  nextVisit: string; visitTime: string; notes: string; preferences: string; updated_at?: string;
};

export function readCachedClients(): Partial<CachedClient>[] {
  try {
    const list = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clientFromRow(row: Record<string, unknown>, cached: Partial<CachedClient>[] = []): CachedClient {
  const s = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : String(value));
  const id = s(row.id);
  const local = cached.find((item) => item && item.id === id);
  return {
    id,
    name: s(row.name),
    company: s(row.company),
    email: s(row.email),
    phone: s(row.phone),
    address: s(row.address),
    nextVisit: s(row.next_visit),
    visitTime: s(row.visit_time),
    notes: s(row.notes),
    preferences: "preferences" in row ? s(row.preferences) : s(local?.preferences),
    ...(typeof row.updated_at === "string" && row.updated_at ? { updated_at: row.updated_at } : {}),
  };
}
