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

/** The active portal token for a client, "" when none, null when it could not be checked. */
export async function activePortal(clientName: string): Promise<string | null> {
  const userId = await getUserId();
  if (!userId || !clientKey(clientName)) return null;
  const { data, error } = await supabase
    .from("client_portals")
    .select("token")
    .eq("owner_id", userId)
    .eq("client_key", clientKey(clientName))
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  return (Array.isArray(data) && data[0]?.token) || "";
}

/** Turns off every active link for the client. */
export async function revokePortal(clientName: string) {
  const userId = await getUserId();
  if (!userId) return "Sign in first.";
  const { error } = await supabase
    .from("client_portals")
    .update({ revoked_at: new Date().toISOString() })
    .eq("owner_id", userId)
    .eq("client_key", clientKey(clientName))
    .is("revoked_at", null);
  return error ? "Could not reach your account. The link was not changed." : "";
}

/** New link for the client; the old one (if any) stops working. */
export async function createPortal(clientName: string): Promise<{ token: string; error: string }> {
  const userId = await getUserId();
  if (!userId) return { token: "", error: "Sign in and save to your account first. Portal links only show documents synced to your account." };
  if (!clientKey(clientName)) return { token: "", error: "Add the client name first." };
  const revokeError = await revokePortal(clientName);
  if (revokeError) return { token: "", error: revokeError };
  const token = newApprovalToken();
  const { error } = await supabase.from("client_portals").insert({ token, owner_id: userId, client_key: clientKey(clientName), client_name: clientName.trim() });
  return error ? { token: "", error: "Could not reach your account. No link was made." } : { token, error: "" };
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
