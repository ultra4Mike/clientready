/**
 * Server only. Option A: loads the change-order chain (the root invoice plus every change order that
 * points at it) for a document found through a client link, with the service role, scoped to its owner.
 * Used so the client page and card checkout apply the same replaced / chain-credit rules as the app.
 */
import { chainCredits, isRevision, replacedBy, revisesOf, revisionOwed } from "@/lib/change-order-revision";
import { serviceClient } from "@/lib/stripe-server";

type Row = { id: string; type: string; title: string; data: Record<string, unknown> };
const UUID = /^[0-9a-f-]{36}$/i;

export async function loadChain(doc: { id: unknown; type?: unknown; title?: unknown; data?: unknown }) {
  const data = (doc.data || {}) as Record<string, unknown>;
  const self: Row = { id: String(doc.id), type: String(doc.type || "invoice"), title: String(doc.title || data.invoiceNumber || ""), data };
  if (!UUID.test(self.id)) return { self, chain: [self] };
  const db = serviceClient();
  const { data: owner } = await db.from("documents").select("user_id").eq("id", self.id).maybeSingle();
  const userId = String((owner as { user_id?: string } | null)?.user_id || "");
  if (!userId) return { self, chain: [self] };
  const byId = new Map<string, Row>([[self.id, self]]);
  const keep = (rows: unknown) => { for (const row of (rows || []) as Row[]) if (!byId.has(String(row.id))) byId.set(String(row.id), { ...row, id: String(row.id), data: row.data || {} }); };
  const cols = "id, type, title, data";
  // Parents only (revises -> parent -> ...), by id, else by invoice number (same as parentOf).
  for (let cur: Row | undefined = self, guard = 0; cur && isRevision(cur) && guard < 20; guard++) {
    const { id, number } = revisesOf(cur);
    let found: Row | undefined;
    if (UUID.test(id)) { const { data: r } = await db.from("documents").select(cols).eq("user_id", userId).eq("id", id).maybeSingle(); if (r) found = r as Row; }
    if (!found && number) { const { data: r } = await db.from("documents").select(cols).eq("user_id", userId).eq("type", "invoice").eq("data->>invoiceNumber", number).limit(1); found = ((r || []) as Row[])[0]; }
    if (!found || byId.has(String(found.id))) break;
    keep([found]);
    cur = byId.get(String(found.id));
  }
  // Revisions made from this document (to know if it was replaced).
  const { data: kidsById } = await db.from("documents").select(cols).eq("user_id", userId).eq("data->>coMode", "revision").eq("data->revises->>id", self.id);
  keep(kidsById);
  const num = String(data.invoiceNumber || "");
  if (num) { const { data: kidsByNum } = await db.from("documents").select(cols).eq("user_id", userId).eq("data->>coMode", "revision").eq("data->revises->>number", num); keep(kidsByNum); }
  return { self, chain: [...byId.values()] };
}

/** What the client page needs: replaced-by (with its own link token) or the chain credits and net owed. */
export async function chainInfo(doc: { id: unknown; type?: unknown; title?: unknown; data?: unknown }) {
  const { self, chain } = await loadChain(doc);
  const by = replacedBy(chain, self);
  if (by) {
    const token = String(((by.data?.approval || {}) as { token?: unknown }).token || "");
    return { replaced: { id: by.id, number: String(by.data?.invoiceNumber || by.title || ""), token } };
  }
  if (!isRevision(self)) return {};
  const was = revisesOf(self);
  return { revision: { owed: revisionOwed(chain, self), credits: chainCredits(chain, self).map(({ number, paid, marked }) => ({ number, paid, marked })), wasNumber: was.number, wasTotal: was.total } };
}
