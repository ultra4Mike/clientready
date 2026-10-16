/** Job templates / package pricing: named sets of line items the owner can drop onto an invoice or proposal. Owner device only (cleared on sign-out). */
export type PackageItem = { description: string; qty: string; rate: string; category?: string };
export type JobPackage = { id: string; name: string; items: PackageItem[] };
export const PACKAGES_KEY = "clientready-packages";

export function readPackages(): JobPackage[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(PACKAGES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && p.id && p.name && Array.isArray(p.items)) : [];
  } catch {
    return [];
  }
}
function write(list: JobPackage[]) {
  window.localStorage.setItem(PACKAGES_KEY, JSON.stringify(list));
}
/** Saves (or replaces, same name ignoring case) a package from non-empty rows. Returns the new list. */
export function savePackage(name: string, items: PackageItem[]): JobPackage[] {
  const clean = items.filter((item) => item.description.trim() || Number(item.rate)).map((item) => ({ description: item.description, qty: item.qty || "1", rate: item.rate || "0", ...(item.category ? { category: item.category } : {}) }));
  if (!name.trim() || !clean.length) return readPackages();
  const rest = readPackages().filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase());
  const next = [...rest, { id: `pkg-${Date.now().toString(36)}`, name: name.trim(), items: clean }].sort((a, b) => a.name.localeCompare(b.name));
  write(next);
  return next;
}
export function deletePackage(id: string): JobPackage[] {
  const next = readPackages().filter((p) => p.id !== id);
  write(next);
  return next;
}
/** Appends package rows; a single blank starting row is replaced. */
export function applyPackage<T extends PackageItem>(current: T[], pkg: JobPackage): T[] {
  const blank = current.length === 1 && !current[0].description.trim() && !Number(current[0].rate);
  return [...(blank ? [] : current), ...pkg.items.map((item) => ({ ...item }) as T)];
}
