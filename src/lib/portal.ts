import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/cloud-docs";
import { newApprovalToken } from "@/lib/approval";
import type { Signature } from "@/lib/signature";

/**
 * Client portal: one no-login link per client (table client_portals, owner-only RLS). The customer
 * side only goes through the SECURITY DEFINER functions get_client_portal / get_portal_document /
 * portal_approve, which return customer-safe data for that owner + client only.
 */
export const clientKey = (name: string) => name.trim().toLowerCase();

export function portalUrl(token: string) {
  return `${window.location.origin}/portal?t=${encodeURIComponent(token)}`;
}

export function portalDocUrl(token: string, docId: string) {
  return `/approve?p=${encodeURIComponent(token)}&d=${encodeURIComponent(docId)}`;
}

/** A client as the portal sees it: the saved client's id when known (stable across renames), plus the name. */
export type PortalClient = { name: string; id?: string };
const asClient = (client: PortalClient | string): PortalClient => (typeof client === "string" ? { name: client } : client);

/** PostgREST filter for this client's rows: its id (plus older name-keyed rows without an id). */
function idFilter(client: PortalClient) {
  const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `client_id.eq.${quote(client.id || "")},and(client_id.is.null,client_key.eq.${quote(clientKey(client.name))})`;
}

/**
 * True when the database doesn't have client_portals.client_id yet (migration
 * 20261015070000_portal_client_id.sql not run). Portal calls then fall back to matching by name.
 */
function noClientIdColumn(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.code === "PGRST204" || /client_id/.test(error.message || "")));
}

export type PortalStatus = { token: string | null; state: "ok" | "signed-out" | "error" };

/** The active portal token for a client ("" when none) and whether it could be checked. */
export async function portalStatus(input: PortalClient | string): Promise<PortalStatus> {
  const client = asClient(input);
  const userId = await getUserId();
  if (!userId) return { token: null, state: "signed-out" };
  if (!clientKey(client.name)) return { token: null, state: "error" };
  // select=* never names client_id, so this works (no 400) before and after migration
  // 20261015070000 adds that column; the match by id, else by name, happens here.
  const { data: rows, error } = await supabase.from("client_portals").select("*").eq("owner_id", userId).is("revoked_at", null).order("created_at", { ascending: false }).limit(200);
  if (error) return { token: null, state: "error" };
  const list = (rows || []) as { token?: string; client_id?: string | null; client_key?: string }[];
  const key = clientKey(client.name);
  const byId = client.id ? list.find((row) => row.client_id === client.id) : undefined;
  const byName = list.find((row) => !row.client_id && row.client_key === key);
  const data = byId ? [byId] : byName ? [byName] : [];
  const token = await linkRow(userId, client, data);
  return { token, state: "ok" };
}

/** The active portal token for a client, "" when none, null when it could not be checked. */
export async function activePortal(input: PortalClient | string): Promise<string | null> {
  return (await portalStatus(input)).token;
}

async function linkRow(userId: string, client: PortalClient, data: unknown) {
  const row = Array.isArray(data) ? (data[0] as { token?: string; client_id?: string | null } | undefined) : undefined;
  // Only when the column exists (the row carries the client_id key), else this update would 400.
  if (row?.token && client.id && row && "client_id" in row && !row.client_id) {
    // Older name-keyed link: tie it to the client id so a later rename keeps the same portal.
    await supabase.from("client_portals").update({ client_id: client.id }).eq("owner_id", userId).eq("token", row.token);
  }
  return row?.token || "";
}

/** Turns off every active link for the client. */
export async function revokePortal(input: PortalClient | string) {
  const client = asClient(input);
  const userId = await getUserId();
  if (!userId) return "Sign in first.";
  const base = () => supabase.from("client_portals").update({ revoked_at: new Date().toISOString() }).eq("owner_id", userId).is("revoked_at", null);
  let { error } = await (client.id ? base().or(idFilter(client)) : base().eq("client_key", clientKey(client.name)));
  if (client.id && noClientIdColumn(error)) ({ error } = await base().eq("client_key", clientKey(client.name)));
  return error ? "Could not reach your account. The link was not changed." : "";
}

/** New link for the client; the old one (if any) stops working. */
export async function createPortal(input: PortalClient | string): Promise<{ token: string; error: string }> {
  const client = asClient(input);
  const userId = await getUserId();
  if (!userId) return { token: "", error: "Sign in and save to your account first. Portal links only show documents synced to your account." };
  if (!clientKey(client.name)) return { token: "", error: "Add the client name first." };
  const revokeError = await revokePortal(client);
  if (revokeError) return { token: "", error: revokeError };
  const token = newApprovalToken();
  const row = { token, owner_id: userId, client_key: clientKey(client.name), client_name: client.name.trim() };
  let { error } = await supabase.from("client_portals").insert({ ...row, ...(client.id ? { client_id: client.id } : {}) });
  if (client.id && noClientIdColumn(error)) ({ error } = await supabase.from("client_portals").insert(row));
  return error ? { token: "", error: "Could not reach your account. No link was made." } : { token, error: "" };
}

/** After a client is renamed: the portal page header follows the new name (contents are keyed by id). */
export async function renamePortalClient(clientId: string, name: string) {
  const userId = await getUserId();
  if (!userId || !clientId || !name.trim()) return;
  await supabase.from("client_portals").update({ client_name: name.trim() }).eq("owner_id", userId).eq("client_id", clientId);
}

type IdDoc = { id: string; type: string; clientName: string; data: Record<string, unknown> };

/** The saved client a document belongs to: its stored clientId, else a unique name match (legacy docs). */
export function clientIdFor(doc: { clientName?: string; data?: Record<string, unknown> }, clients: { id: string; name: string }[]) {
  const stored = String(doc.data?.clientId || "");
  if (stored) return stored;
  const key = clientKey(String(doc.data?.clientName || doc.clientName || ""));
  const hits = key ? clients.filter((client) => clientKey(client.name) === key) : [];
  return hits.length === 1 ? hits[0].id : "";
}

/**
 * One-time backfill (per account): give invoices/proposals without a clientId the id of the one saved
 * client whose name matches. Only adds data.clientId; nothing else on the document changes.
 * Ambiguous or unmatched names are left alone and keep matching by name.
 */
export async function backfillClientIds(clients: { id: string; name: string }[]) {
  const userId = await getUserId();
  if (!userId || !clients.length) return 0;
  const flag = `clientready-clientid-backfill-${userId}`;
  if (window.localStorage.getItem(flag)) return 0;
  const { data: rows, error } = await supabase.from("documents").select("id, type, client_name, data").eq("user_id", userId);
  if (error || !Array.isArray(rows)) return 0;
  const patched: Record<string, string> = {};
  for (const row of rows as { id: string; type: string; client_name?: string; data?: Record<string, unknown> }[]) {
    if (!["invoice", "proposal"].includes(row.type) || row.data?.clientId) continue;
    const id = clientIdFor({ clientName: row.client_name, data: row.data }, clients);
    if (!id) continue;
    const { error: saveError } = await supabase
      .from("documents")
      .update({ data: { ...(row.data || {}), clientId: id, updatedAt: new Date().toISOString() } })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (saveError) return 0; // try again next time
    patched[row.id] = id;
  }
  try {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? (JSON.parse(raw) as IdDoc[]) : [];
    let changed = false;
    for (const doc of docs) {
      const id = patched[doc.id] || (!doc.data?.clientId && ["invoice", "proposal"].includes(doc.type) ? clientIdFor(doc, clients) : "");
      if (id && !doc.data?.clientId) {
        doc.data = { ...(doc.data || {}), clientId: id };
        changed = true;
      }
    }
    if (changed) window.localStorage.setItem("clientready-documents", JSON.stringify(docs));
  } catch {
    // local copy is refreshed from the cloud on the next load anyway
  }
  window.localStorage.setItem(flag, new Date().toISOString());
  return Object.keys(patched).length;
}

export type PortalDoc = { id: string; type: string; title: string; clientName: string; data: Record<string, unknown> };
export type PortalBusiness = { name: string; logo: string; paymentLink: string; email: string; phone: string };

export async function fetchPortal(token: string) {
  const { data, error } = await supabase.rpc("get_client_portal", { p_token: token });
  if (error) throw error;
  return data as null | { clientName: string; business: PortalBusiness; documents: PortalDoc[] };
}

export async function fetchPortalDoc(token: string, docId: string) {
  const { data, error } = await supabase.rpc("get_portal_document", { p_token: token, p_doc_id: docId });
  if (error) throw error;
  return data as null | { type: string; title: string; clientName: string; data: Record<string, unknown>; business: PortalBusiness };
}

export async function portalApprove(token: string, docId: string, name: string, signature: Signature | null) {
  const { data, error } = await supabase.rpc("portal_approve", { p_token: token, p_doc_id: docId, p_name: name, p_signature: signature });
  if (error) throw error;
  return data as Record<string, unknown> | null;
}
