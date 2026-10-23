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
  const rootId = String(((data.changeOrderOf || {}) as { id?: unknown }).id || self.id);
  if (!UUID.test(rootId) || !UUID.test(self.id)) return { self, chain: [self] };
  const { data: owner } = await serviceClient().from("documents").select("user_id").eq("id", self.id).maybeSingle();
  const userId = String((owner as { user_id?: string } | null)?.user_id || "");
  if (!userId) return { self, chain: [self] };
  const { data: rows } = await serviceClient().from("documents").select("id, type, title, data").eq("user_id", userId).or(`id.eq.${rootId},data->changeOrderOf->>id.eq.${rootId}`);
  return { self, chain: [self, ...((rows || []) as Row[]).filter((row) => String(row.id) !== self.id).map((row) => ({ ...row, id: String(row.id), data: row.data || {} }))] };
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
  return { revision: { owed: revisionOwed(chain, self), credits: chainCredits(chain, self).map(({ number, paid }) => ({ number, paid })), wasNumber: was.number, wasTotal: was.total } };
}
