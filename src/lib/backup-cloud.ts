import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { isUuid } from "@/lib/cloud-docs";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

/**
 * Backup gaps: after a restore, write it to the account so the next reload does not replace it.
 * Clients and team go up as upserts (cloud ids) or inserts; documents go through the normal
 * merge + upload (newer cloud copies still win; restored-only docs are uploaded).
 */
export async function pushRestoreToCloud(restored: { clients?: Row[]; employees?: Row[] }) {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return { ok: false, failed: 0 };
  let failed = 0;
  const clientRow = (c: Row) => ({ user_id: uid, name: s(c.name), company: s(c.company), email: s(c.email), phone: s(c.phone), address: s(c.address), notes: s(c.notes) });
  const people = (restored.employees || []).map((e) => ({ user_id: uid, id: s(e.id), name: s(e.name), email: s(e.email), phone: s(e.phone), role: s(e.role), kind: s(e.kind) || "employee", rate: s(e.rate), hire_date: s(e.hireDate), active: e.active !== false }));
  const clients = restored.clients || [];
  const results = await Promise.all([
    clients.filter((c) => isUuid(s(c.id))).length ? supabase.from("clients").upsert(clients.filter((c) => isUuid(s(c.id))).map((c) => ({ id: s(c.id), ...clientRow(c) }))) : Promise.resolve({ error: null }),
    clients.filter((c) => !isUuid(s(c.id))).length ? supabase.from("clients").insert(clients.filter((c) => !isUuid(s(c.id))).map(clientRow)) : Promise.resolve({ error: null }),
    people.length ? supabase.from("employees").upsert(people) : Promise.resolve({ error: null }),
  ]);
  for (const r of results) if (r.error) failed += 1;
  const docs = await loadAccountIntoCache().catch(() => false);
  return { ok: failed === 0 && docs, failed };
}
