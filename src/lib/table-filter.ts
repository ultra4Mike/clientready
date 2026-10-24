/** Sorting and filtering for Reports & Taxes tables (pure, so it is unit-tested). */
export type Col<T> = { key: string; label: string; value: (row: T) => string | number | null | undefined; type?: "text" | "money" | "number" | "date"; filter?: boolean };
export type Filters = { from: string; to: string; q: string; pick: Record<string, string> };

export function filterRows<T>(rows: T[], cols: Col<T>[], f: Filters) {
  const dateCol = cols.find((c) => c.type === "date");
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (dateCol && (f.from || f.to)) {
      const d = String(dateCol.value(r) ?? "").slice(0, 10);
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    for (const [key, want] of Object.entries(f.pick)) {
      if (!want) continue;
      const c = cols.find((x) => x.key === key);
      if (c && String(c.value(r) ?? "") !== want) return false;
    }
    if (words.length) {
      const hay = cols.map((c) => String(c.value(r) ?? "")).join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function sortRows<T>(rows: T[], cols: Col<T>[], sort: { key: string; dir: "asc" | "desc" }) {
  const c = cols.find((x) => x.key === sort.key);
  if (!c) return rows;
  const num = c.type === "money" || c.type === "number";
  const out = [...rows].sort((a, b) => {
    const x = c.value(a), y = c.value(b);
    return num ? Number(x || 0) - Number(y || 0) : String(x ?? "").localeCompare(String(y ?? ""));
  });
  return sort.dir === "desc" ? out.reverse() : out;
}
