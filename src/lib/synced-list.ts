import { supabase } from "@/lib/supabase";

/**
 * Owner lists kept on this device and in one jsonb column on the owner's profile row, so the PC and the phone share them.
 * Rows carry updatedAt; a delete keeps a tombstone. Devices merge per id, newest updatedAt wins.
 * If the column is missing (migration not run yet) the list stays on this device.
 */
export type SyncedRow = { id: string; updatedAt?: string; deleted?: boolean };

export function mergeRows<T extends SyncedRow>(a: unknown, b: unknown): T[] {
  const byId = new Map<string, T>();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const row of list as T[]) {
      if (!row || typeof row.id !== "string") continue;
      const have = byId.get(row.id);
      if (!have || String(row.updatedAt || "") > String(have.updatedAt || "")) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function syncedList<T extends SyncedRow>(key: string, column: string) {
  const readAll = (): T[] => {
    try {
      const list = JSON.parse(window.localStorage.getItem(key) || "[]");
      return Array.isArray(list) ? list.filter((row) => row && typeof row.id === "string") : [];
    } catch {
      return [];
    }
  };
  const write = (list: T[]) => window.localStorage.setItem(key, JSON.stringify(list));
  const read = () => readAll().filter((row) => !row.deleted);
  let chain: Promise<void> = Promise.resolve();
  async function sync(): Promise<T[]> {
    chain = chain.catch(() => {}).then(async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return;
      const { data: row, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error || !row || !(column in row)) return;
      const merged = mergeRows<T>(row[column], readAll());
      write(mergeRows<T>(readAll(), merged));
      if (JSON.stringify(merged) !== JSON.stringify(row[column])) await supabase.from("profiles").update({ [column]: merged }).eq("id", user.id);
    }).catch(() => {});
    await chain;
    return read();
  }
  function upsert(row: Omit<T, "updatedAt">): T[] {
    const next = { ...row, updatedAt: new Date().toISOString() } as T;
    write([...readAll().filter((item) => item.id !== next.id), next]);
    void sync();
    return read();
  }
  function remove(id: string): T[] {
    write(readAll().map((item) => (item.id === id ? ({ id, deleted: true, updatedAt: new Date().toISOString() } as T) : item)));
    void sync();
    return read();
  }
  return { key, read, sync, upsert, remove };
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
