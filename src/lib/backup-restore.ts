/**
 * Backup gaps (Help tests/backup-restore.test.ts): the ONE restore. Checks shape and owner first, then
 * merges by id (this device's newer records are kept), restores employees, and keeps live approval links.
 * Pure (a key/value store), so the page and the tests run the same code.
 */
type Row = Record<string, unknown>;
export type KV = { get(key: string): string | null | undefined; set(key: string, value: string): void };
export type RestorePlan = { ok: true; backup: Backup; newerLocal: number } | { ok: false; reason: string };
type Backup = { ownerId?: string; profile?: Row | null; clients?: Row[]; documents?: Row[]; employees?: Row[]; appointments?: unknown[] };

const KEYS = { profile: "clientready-profile", clients: "clientready-clients", documents: "clientready-documents", employees: "clientready-employees", appointments: "clientready-appointments" } as const;
const isObj = (v: unknown): v is Row => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const list = (kv: KV, key: string): Row[] => { try { const v = JSON.parse(kv.get(key) || "[]"); return Array.isArray(v) ? v.filter(isObj) : []; } catch { return []; } };
const stamp = (row: Row) => Date.parse(String((row.data as Row | undefined)?.updatedAt || row.updatedAt || "")) || 0;

/** Parse + validate. Wrong shape or another account's backup is refused before anything is written. */
export function planRestore(text: string, kv: KV, ownerId = ""): RestorePlan {
  let backup: unknown;
  try { backup = JSON.parse(text || ""); } catch { return { ok: false, reason: "That file is not a ClientReady backup (it could not be read)." }; }
  if (!isObj(backup)) return { ok: false, reason: "That file is not a ClientReady backup." };
  const b = backup as Backup;
  for (const key of ["clients", "documents", "employees", "appointments"] as const) if (b[key] !== undefined && !Array.isArray(b[key])) return { ok: false, reason: `The backup's ${key} are not a list.` };
  if (b.profile !== undefined && b.profile !== null && !isObj(b.profile)) return { ok: false, reason: "The backup's business profile is damaged." };
  if ((b.documents || []).some((d) => !isObj(d) || typeof d.id !== "string" || typeof d.type !== "string")) return { ok: false, reason: "Some documents in the backup are damaged." };
  if (!b.profile && !b.clients && !b.documents && !b.employees) return { ok: false, reason: "That backup has nothing to restore." };
  if (b.ownerId && ownerId && b.ownerId !== ownerId) return { ok: false, reason: "This backup belongs to a different account." };
  // How many records on this device are newer than (or missing from) the backup: shown before restoring.
  let newerLocal = 0;
  for (const key of ["clients", "documents", "employees"] as const) {
    const incoming = new Map((b[key] || []).map((row) => [String(row.id), row]));
    for (const row of list(kv, KEYS[key])) { const other = incoming.get(String(row.id)); if (!other || stamp(row) > stamp(other)) newerLocal += 1; }
  }
  return { ok: true, backup: b, newerLocal };
}

function mergeById(local: Row[], incoming: Row[], mode: "merge" | "replace") {
  if (mode === "replace") return incoming;
  const byId = new Map(local.map((row) => [String(row.id), row]));
  for (const row of incoming) { const mine = byId.get(String(row.id)); if (!mine || stamp(row) >= stamp(mine)) byId.set(String(row.id), row); }
  return [...byId.values()];
}

/** Write the plan. merge (default): this device's newer records and records not in the backup are kept. */
export function applyRestore(kv: KV, backup: Backup, mode: "merge" | "replace" = "merge") {
  const current = list(kv, KEYS.documents);
  const keepLive = (docs: Row[]) => docs.map((doc) => {
    const live = (current.find((item) => item.id === doc.id)?.data as Row | undefined)?.approval;
    return live && isObj(doc.data) ? { ...doc, data: { ...doc.data, approval: live } } : doc;
  });
  if (backup.profile && (mode === "replace" || !kv.get(KEYS.profile))) kv.set(KEYS.profile, JSON.stringify(backup.profile));
  if (backup.clients) kv.set(KEYS.clients, JSON.stringify(mergeById(list(kv, KEYS.clients), backup.clients, mode)));
  if (backup.employees) kv.set(KEYS.employees, JSON.stringify(mergeById(list(kv, KEYS.employees), backup.employees, mode)));
  if (backup.documents) kv.set(KEYS.documents, JSON.stringify(keepLive(mergeById(current, backup.documents, mode))));
  if (backup.appointments) kv.set(KEYS.appointments, JSON.stringify(backup.appointments));
  return { documents: backup.documents?.length || 0, clients: backup.clients?.length || 0, employees: backup.employees?.length || 0 };
}

/** One call: plan + apply. "failed" leaves every key untouched. */
export function restoreBackupText(kv: KV, text: string, ownerId = "", mode: "merge" | "replace" = "merge"): "restored" | "failed" {
  const plan = planRestore(text, kv, ownerId);
  if (!plan.ok) return "failed";
  applyRestore(kv, plan.backup, mode);
  return "restored";
}
