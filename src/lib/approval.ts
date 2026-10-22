import { linkOrigin } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { getUserId, isUuid, type CloudDoc } from "@/lib/cloud-docs";

export type Approval = {
  token?: string; // owner copy only; the public view never returns it
  createdAt: string;
  status: "pending" | "approved";
  approvedAt?: string;
  approverName?: string;
};

const DOCS_KEY = "clientready-documents";

export function readApproval(value: unknown): Approval | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Approval>;
  if (raw.status !== "pending" && raw.status !== "approved") return null;
  return {
    ...(raw.token ? { token: String(raw.token) } : {}),
    createdAt: String(raw.createdAt || ""),
    status: raw.status,
    ...(raw.approvedAt ? { approvedAt: String(raw.approvedAt) } : {}),
    ...(raw.approverName ? { approverName: String(raw.approverName) } : {}),
  };
}

/** 256 random bits from the browser's CSPRNG, base64url (43 chars). */
export function newApprovalToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function approvalUrl(token: string) {
  return `${linkOrigin()}/approve?t=${encodeURIComponent(token)}`;
}

/** Help retest: "Awaiting approval" only on proposals and change orders; a plain invoice never needs approval. */
export function approvalBadgeApplies(doc: { type?: string; data?: Record<string, unknown> | null }, approval: Approval | null) {
  if (!approval) return false;
  if (doc.type !== "invoice") return true;
  const of = doc.data?.changeOrderOf as { id?: string; number?: string } | undefined;
  return Boolean(of?.id || of?.number) || approval.status === "approved";
}

export function approvalLabel(approval: Approval | null) {
  if (!approval) return "";
  if (approval.status === "approved") {
    const when = approval.approvedAt ? new Date(approval.approvedAt) : null;
    const text = when && !Number.isNaN(when.getTime())
      ? when.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    return `Approved${text ? ` on ${text}` : ""}${approval.approverName ? ` by ${approval.approverName}` : ""}`;
  }
  return "Awaiting approval";
}

function readDocs(): CloudDoc[] {
  const raw = window.localStorage.getItem(DOCS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeApproval(id: string, approval: Approval | null) {
  const docs = readDocs().map((doc) => {
    if (doc.id !== id) return doc;
    const data = { ...(doc.data || {}) };
    if (approval) data.approval = approval;
    else delete data.approval;
    return { ...doc, data };
  });
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
}

/** Why a link can't be shared yet, or "" when the doc is saved to the signed-in account. */
export async function approvalBlocker(docId: string) {
  if (!docId) return "Save this document first.";
  if (!(await getUserId())) return "Sign in and save this document to your account first. Approval links only work for documents synced to your account.";
  if (!isUuid(docId)) return "This document is only saved on this device. Save it again while signed in to sync it to your account, then share the link.";
  return "";
}

/**
 * Creates (or replaces) the approval link on a synced document and saves it to the cloud.
 * Passing null revokes the link. Returns the new approval, or an error message.
 */
export async function setApproval(docId: string, mode: "create" | "revoke"): Promise<{ approval: Approval | null; error: string }> {
  const blocker = await approvalBlocker(docId);
  if (blocker) return { approval: null, error: blocker };
  const doc = readDocs().find((item) => item.id === docId);
  if (!doc) return { approval: null, error: "Save this document first." };
  const approval: Approval | null = mode === "create"
    ? { token: newApprovalToken(), createdAt: new Date().toISOString(), status: "pending" }
    : null;
  const data: Record<string, unknown> = { ...(doc.data || {}), updatedAt: new Date().toISOString() };
  if (approval) data.approval = approval;
  else delete data.approval;
  const { error } = await supabase
    .from("documents")
    .update({ data })
    .eq("id", docId)
    .eq("user_id", (await getUserId()) as string);
  if (error) return { approval: null, error: "Could not reach your account. The link was not changed." };
  const docs = readDocs().map((item) => (item.id === docId ? { ...item, data } : item));
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
  return { approval, error: "" };
}

/**
 * Reads the approval block from the cloud copy (cloud always wins for approval) and stores it
 * locally. Returns undefined when it could not be checked (signed out, offline, local-only doc).
 */
export async function refreshApproval(docId: string): Promise<Approval | null | undefined> {
  if (!isUuid(docId)) return undefined;
  const userId = await getUserId();
  if (!userId) return undefined;
  const { data, error } = await supabase.from("documents").select("data").eq("id", docId).eq("user_id", userId).maybeSingle();
  if (error || !data) return undefined;
  const approval = readApproval((data.data as Record<string, unknown> | null)?.approval);
  writeApproval(docId, approval);
  return approval;
}

/** Public: the trimmed document behind a token, or null. */
export async function fetchApprovalDoc(token: string) {
  const { data, error } = await supabase.rpc("get_document_by_approval_token", { p_token: token });
  if (error) throw error;
  return data as null | {
    type: string;
    title: string;
    clientName: string;
    data: Record<string, unknown>;
    business: { name: string; logo: string; paymentLink: string; email: string; phone: string };
  };
}

/** Public: approves the document behind a token. Returns the new approval, or null if not pending/unknown. */
export async function approveByToken(token: string, name: string) {
  const { data, error } = await supabase.rpc("approve_document", { p_token: token, p_name: name });
  if (error) throw error;
  return readApproval(data);
}

/** Backlog 14: the visit behind a customer link (date/time/status only), or null. Before migration 20261021120000: null. */
export type PublicVisit = { date: string; startTime: string; endTime: string; status: string };
export async function fetchVisitByToken(token: string): Promise<PublicVisit | null> {
  const { data, error } = await supabase.rpc("get_visit_by_approval_token", { p_token: token });
  if (error || !data || typeof data !== "object") return null;
  const v = data as Record<string, unknown>;
  return { date: String(v.date || ""), startTime: String(v.startTime || ""), endTime: String(v.endTime || ""), status: String(v.status || "scheduled") };
}

/** Approve from the customer link with an optional signature; falls back to the plain approval before the migration. */
export async function approveByTokenSigned(token: string, name: string, signature: unknown) {
  if (signature) {
    const { data, error } = await supabase.rpc("approve_document_signed", { p_token: token, p_name: name, p_signature: signature });
    if (!error) return { approval: readApproval(data), raw: data as Record<string, unknown> | null };
    if (!/approve_document_signed|function/i.test(error.message || "")) throw error;
  }
  return { approval: await approveByToken(token, name), raw: null };
}
