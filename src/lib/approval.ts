import { linkOrigin } from "@/lib/site";
import { supabase } from "@/lib/supabase";
import { getUserId, isUuid, type CloudDoc } from "@/lib/cloud-docs";

export type Approval = {
  token?: string; // owner copy only; the public view never returns it
  createdAt: string;
  status: "pending" | "approved";
  approvedAt?: string;
  approverName?: string;
  markedBy?: string; // owner recorded the approval (e.g. the client said yes by phone)
  method?: string; // "phone" when the owner recorded it; absent for the client's own online approval
  approvedBy?: string; // owner's name
  note?: string;
};

/** Append-only document history entry. Entries are only ever added (never edited or removed) by these helpers. */
export type HistoryEntry = { at: string; by: string; byId?: string; action: string; note?: string };
export function readHistory(value: unknown): HistoryEntry[] {
  return Array.isArray(value) ? value.filter((e) => e && typeof e === "object" && typeof (e as HistoryEntry).at === "string" && typeof (e as HistoryEntry).action === "string") as HistoryEntry[] : [];
}
/** "Oct 23, 2026 10:29 PM CT" style (the viewer's zone, short label). */
export function historyTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const zone = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "";
  const label = /^C[SD]T$/.test(zone) ? "CT" : /^E[SD]T$/.test(zone) ? "ET" : /^M[SD]T$/.test(zone) ? "MT" : /^P[SD]T$/.test(zone) ? "PT" : zone;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${label}`.trim();
}
export function approvalLine(a: Approval | null) {
  if (!a || a.status !== "approved" || !a.approvedAt) return "";
  return a.method === "phone" ? `Approved by phone · ${historyTime(a.approvedAt)} · by ${a.approvedBy || a.markedBy || "owner"}${a.note ? ` · ${a.note}` : ""}` : `Approved · ${historyTime(a.approvedAt)}${a.approverName ? ` · by ${a.approverName}` : ""}`;
}

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
    ...(raw.markedBy ? { markedBy: String(raw.markedBy) } : {}),
    ...(raw.method ? { method: String(raw.method) } : {}),
    ...(raw.approvedBy ? { approvedBy: String(raw.approvedBy) } : {}),
    ...(raw.note ? { note: String(raw.note) } : {}),
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
  if (["void", "voided"].includes(String(doc.data?.status || ""))) return false;
  if (doc.type !== "invoice") return true;
  // Help live check: a plain invoice (even one made from an approved proposal) shows no approval badge.
  const of = doc.data?.changeOrderOf as { id?: string; number?: string } | undefined;
  return Boolean(of?.id || of?.number);
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

/** Owner rule: drafts can't be approved until sent; already-approved stays as is. */
export function canOwnerMarkApproved(status: string, approval: Approval | null) {
  return status !== "draft" && approval?.status !== "approved";
}

/**
 * The owner records an approval the client gave outside the app (phone, in person). Who and when go on the approval
 * and into the document history. Saved to the cloud like setApproval (cloud is the source of truth for approval).
 */
export async function ownerMarkApproved(docId: string, ownerName: string, options: { method?: string; note?: string; undo?: boolean } = {}): Promise<{ approval: Approval | null; error: string }> {
  const blocker = await approvalBlocker(docId);
  if (blocker) return { approval: null, error: blocker };
  const doc = readDocs().find((item) => item.id === docId);
  if (!doc) return { approval: null, error: "Save this document first." };
  const cur = (doc.data || {}) as Record<string, unknown>;
  const status = String(cur.status || "draft");
  const current = readApproval(cur.approval);
  const at = new Date().toISOString();
  const by = ownerName.trim() || "Owner";
  const byId = (await getUserId()) as string;
  const note = (options.note || "").trim().slice(0, 200);
  let approval: Approval | null;
  let entry: HistoryEntry;
  if (options.undo) {
    if (current?.status !== "approved") return { approval: current, error: "" };
    // Undo goes back to "sent, waiting for approval"; a fresh token is not needed, the old link keeps working.
    approval = { ...(current.token ? { token: current.token } : {}), createdAt: current.createdAt || at, status: "pending" };
    entry = { at, by, byId, action: "Approval undone by owner", ...(note ? { note } : {}) };
  } else {
    if (!canOwnerMarkApproved(status, current)) return { approval: current, error: status === "draft" ? "Send it to the client first. Drafts can't be approved." : "" };
    const method = options.method || "phone";
    approval = { ...(current || { createdAt: at }), status: "approved", approvedAt: at, approverName: `${by} (${method === "phone" ? "by phone" : "marked by owner"})`, markedBy: by, method, approvedBy: by, ...(note ? { note } : {}) };
    entry = { at, by, byId, action: method === "phone" ? "Approved by phone" : "Marked approved by owner", ...(note ? { note } : {}) };
  }
  const history = [...readHistory(cur.history), entry];
  const data: Record<string, unknown> = { ...cur, approval, history, updatedAt: at };
  if (options.undo && doc.type === "proposal" && cur.status === "accepted") data.status = "sent";
  const { error } = await supabase.from("documents").update({ data }).eq("id", docId).eq("user_id", byId);
  if (error) return { approval: current, error: "Could not reach your account. Nothing was changed." };
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(readDocs().map((item) => (item.id === docId ? { ...item, data } : item))));
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
