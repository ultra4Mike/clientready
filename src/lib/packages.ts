import { supabase } from "@/lib/supabase";

/**
 * Job templates / package pricing: named sets of line items the owner can drop onto an invoice or proposal.
 * Stored on this device and in profiles.packages (migration 20261016020000) so the PC and phone share them.
 * Each package carries updatedAt; a delete keeps a tombstone so the other device doesn't bring it back.
 * Devices merge per package id, newest updatedAt wins. Cleared from the device on sign-out.
 */
export type PackageItem = { description: string; qty: string; rate: string; category?: string };
export type JobPackage = { id: string; name: string; items: PackageItem[]; updatedAt?: string; deleted?: boolean };
export const PACKAGES_KEY = "clientready-packages";

function readAll(): JobPackage[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(PACKAGES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}
function visible(list: JobPackage[]) {
  return list.filter((p) => !p.deleted && p.name && Array.isArray(p.items)).sort((a, b) => a.name.localeCompare(b.name));
}
export function readPackages(): JobPackage[] {
  return visible(readAll());
}
function write(list: JobPackage[]) {
  window.localStorage.setItem(PACKAGES_KEY, JSON.stringify(list));
}

/** Per id, the newer updatedAt wins (a tombstone counts as a change). */
export function mergePackages(a: unknown, b: unknown): JobPackage[] {
  const byId = new Map<string, JobPackage>();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const p of list as JobPackage[]) {
      if (!p || typeof p.id !== "string") continue;
      const have = byId.get(p.id);
      if (!have || String(p.updatedAt || "") > String(have.updatedAt || "")) byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}

let pushing: Promise<void> | null = null;
/** Merges this device's list with the profile's and writes both. Missing column (migration not run) = keep local only. */
export async function syncPackages(): Promise<JobPackage[]> {
  const run = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;
    const { data: row, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error || !row || !("packages" in row)) return;
    const merged = mergePackages(row.packages, readAll());
    write(mergePackages(readAll(), merged));
    if (JSON.stringify(merged) !== JSON.stringify(row.packages)) {
      await supabase.from("profiles").update({ packages: merged }).eq("id", user.id);
    }
  };
  const previous = pushing;
  pushing = (async () => { if (previous) await previous.catch(() => {}); await run().catch(() => {}); })();
  await pushing;
  return readPackages();
}

/** Saves (or replaces, same name ignoring case, keeping its id) a package from non-empty rows. Returns the visible list. */
export function savePackage(name: string, items: PackageItem[]): JobPackage[] {
  const clean = items.filter((item) => item.description.trim() || Number(item.rate)).map((item) => ({ description: item.description, qty: item.qty || "1", rate: item.rate || "0", ...(item.category ? { category: item.category } : {}) }));
  if (!name.trim() || !clean.length) return readPackages();
  const all = readAll();
  const same = all.find((p) => !p.deleted && p.name.toLowerCase() === name.trim().toLowerCase());
  const pkg: JobPackage = { id: same?.id || `pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), items: clean, updatedAt: new Date().toISOString() };
  write([...all.filter((p) => p.id !== pkg.id), pkg]);
  void syncPackages();
  return readPackages();
}
export function deletePackage(id: string): JobPackage[] {
  write(readAll().map((p) => (p.id === id ? { id, name: p.name, items: [], deleted: true, updatedAt: new Date().toISOString() } : p)));
  void syncPackages();
  return readPackages();
}
/** Appends package rows; a single blank starting row is replaced. */
export function applyPackage<T extends PackageItem>(current: T[], pkg: JobPackage): T[] {
  const blank = current.length === 1 && !current[0].description.trim() && !Number(current[0].rate);
  return [...(blank ? [] : current), ...pkg.items.map((item) => ({ ...item }) as T)];
}
