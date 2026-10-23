/**
 * Change orders need a fresh customer approval: a signature approves one version and price, so it never
 * carries over. A sent change order (revision or add-on) that isn't signed or approved yet is flagged
 * "Needs customer signature". Drafts and void docs never are. Display only: no money logic here.
 */
import { readSignature, type Signature } from "@/lib/signature";

type Doc = { id?: string; type?: string; title?: string; data?: Record<string, unknown> | null };
// Pure read of data.approval (approval.ts pulls in the Supabase client).
function readApproval(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const raw = value as { status?: unknown; approvedAt?: unknown; approverName?: unknown };
  if (raw.status !== "pending" && raw.status !== "approved") return null;
  return { status: raw.status, approvedAt: String(raw.approvedAt || ""), approverName: String(raw.approverName || "") };
}
const dataOf = (doc?: Doc | null) => (doc?.data || {}) as Record<string, unknown>;

export function isChangeOrder(doc?: Doc | null) {
  const data = dataOf(doc);
  if (doc?.type !== "invoice") return false;
  const of = (data.changeOrderOf || {}) as { id?: unknown; number?: unknown };
  return data.coMode === "revision" || Boolean(of.id || of.number);
}

/** The customer's sign-off on a doc: its own signature, else an approved approval (with its signature). */
export function docSignOff(doc?: Doc | null): { name: string; at: string } | null {
  const data = dataOf(doc);
  const approval = readApproval(data.approval);
  const sig: Signature | null = readSignature(data.signature)
    || (approval?.status === "approved" ? readSignature((data.approval as { signature?: unknown }).signature) : null)
    || readSignature(data.proposalSignature);
  if (sig) return { name: sig.signerName || "", at: sig.signedAt || approval?.approvedAt || "" };
  if (approval?.status === "approved") return { name: approval.approverName || "", at: approval.approvedAt || "" };
  return null;
}

export function needsCoSignature(doc?: Doc | null) {
  if (!isChangeOrder(doc)) return false;
  const data = dataOf(doc);
  const status = String(data.status || "draft");
  if (["draft", "void", "voided", "deleted"].includes(status) || data.deleted) return false;
  return !docSignOff(doc);
}

/** The earlier version this change order came from (revision parent, else the original). */
export function previousVersion<T extends Doc>(docs: T[], doc: Doc): T | null {
  const find = (ref: unknown) => {
    const r = (ref || {}) as { id?: unknown; number?: unknown };
    const id = String(r.id || ""), num = String(r.number || "");
    return (id && docs.find((d) => d.id === id)) || (num && docs.find((d) => String(dataOf(d).invoiceNumber || d.title || "") === num)) || null;
  };
  return find(dataOf(doc).revises) || find(dataOf(doc).changeOrderOf);
}

function niceDate(at: string) {
  const d = new Date(at);
  return at && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : at;
}

export function coSignatureMessage(prev: { name: string; at: string } | null) {
  if (!prev) return "Needs customer signature";
  const who = prev.name || "the customer";
  const when = prev.at ? ` on ${niceDate(prev.at)}` : "";
  return `Needs customer signature: the previous version was signed by ${who}${when}, so this change needs a new approval`;
}

export function coSignatureBanner(docs: Doc[], doc: Doc) {
  if (!needsCoSignature(doc)) return "";
  const prev = previousVersion(docs, doc);
  return coSignatureMessage(prev ? docSignOff(prev) : null);
}
