import { randomBytes } from "node:crypto";
import { serviceClient, stripeConfig } from "@/lib/stripe-server";
import { invoiceFromProposal } from "@/lib/proposal-convert";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ymdIn = (tz: string) => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};

/**
 * R128: after the client approves a proposal (approval link or portal), the server turns it into an
 * invoice once (idempotent: an invoice already made from this proposal is reused). Returns the
 * invoice's customer link so a requested deposit is paid on the invoice and counted once.
 * Nothing is emailed here.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.serviceKey || !config.supabaseUrl) return Response.json({ error: "Not available." }, { status: 503 });
  if (await rateLimitedShared(`convert:${clientIp(request)}`, 20, 60_000)) return tooMany();
  let token = "", portal = "", docId = "";
  try {
    const body = (await request.json()) as { token?: unknown; portal?: unknown; docId?: unknown };
    token = String(body.token || ""); portal = String(body.portal || ""); docId = String(body.docId || "");
  } catch { /* empty body */ }
  const viaPortal = portal.length >= 32 && /^[0-9a-f-]{36}$/i.test(docId);
  if (!viaPortal && token.length < 32) return Response.json({ error: "Link not found." }, { status: 404 });
  const client = serviceClient();
  const { data: rows, error } = viaPortal
    ? await client.rpc("stripe_invoice_for_portal", { p_token: portal, p_doc_id: docId })
    : await client.rpc("stripe_invoice_for_token", { p_token: token });
  const doc = (Array.isArray(rows) ? rows[0] : rows) as { id: string; type: string; title?: string; data?: Record<string, unknown> } | null;
  if (error || !doc) return Response.json({ error: "Link not found." }, { status: 404 });
  if (doc.type !== "proposal") return Response.json({ error: "Only proposals are turned into invoices." }, { status: 400 });
  const approval = (doc.data?.approval || null) as Record<string, unknown> | null;
  if (approval?.status !== "approved") return Response.json({ error: "Approve the proposal first.", needsApproval: true }, { status: 409 });

  const { data: ownerRow } = await client.from("documents").select("user_id").eq("id", doc.id).maybeSingle();
  const userId = (ownerRow as { user_id?: string } | null)?.user_id;
  if (!userId) return Response.json({ error: "Link not found." }, { status: 404 });
  const { data: ownerDocs } = await client.from("documents").select("id, type, title, data").eq("user_id", userId);
  const docs = (ownerDocs || []) as { id: string; type: string; title?: string; data?: Record<string, unknown> }[];
  const existing = docs.find((d) => d.type === "invoice" && (d.data?.fromProposal as { id?: string } | undefined)?.id === doc.id && !d.data?.deleted && d.data?.status !== "void");
  const linkOf = (d: { id: string; data?: Record<string, unknown> }) => ({ invoiceId: d.id, number: String(d.data?.invoiceNumber || ""), token: String((d.data?.approval as { token?: string } | undefined)?.token || "") });
  // Mark the proposal itself as invoiced on the server so Documents (and every device's localStorage
  // after sync) shows Invoiced, not "sent".
  const markProposal = async (inv: { id: string; data?: Record<string, unknown> }) => {
    const pd = (doc.data || {}) as Record<string, unknown>;
    const already = (pd.invoicedAs as { id?: string } | undefined)?.id === inv.id && pd.status === "invoiced";
    if (already) return;
    await client.from("documents").update({ data: { ...pd, status: "invoiced", invoicedAs: { id: inv.id, number: String(inv.data?.invoiceNumber || "") }, updatedAt: new Date().toISOString() } }).eq("id", doc.id);
  };
  if (existing) {
    await markProposal(existing);
    const link = linkOf(existing);
    if (!link.token) {
      // A manually made invoice without a customer link gets one (already approved, via the proposal).
      const fresh = randomBytes(32).toString("base64url");
      await client.from("documents").update({ data: { ...existing.data, approval: { token: fresh, status: "approved", viaProposal: true, approvedAt: approval.approvedAt || new Date().toISOString(), approverName: approval.approverName || "" } } }).eq("id", existing.id);
      link.token = fresh;
    }
    return Response.json({ ...link, created: false });
  }
  const { data: profile } = await client.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const tz = String((profile as { timezone?: string } | null)?.timezone || process.env.BUSINESS_TIMEZONE || "America/Chicago");
  const fresh = randomBytes(32).toString("base64url");
  const { token: _drop, ...approvalPublic } = approval; void _drop;
  const { number, data } = invoiceFromProposal(doc, docs, { today: ymdIn(tz), token: fresh, approval: approvalPublic });
  data.updatedAt = new Date().toISOString();
  const { data: inserted, error: insertError } = await client.from("documents").insert({ user_id: userId, type: "invoice", title: number, client_name: String(doc.data?.clientName || "Client"), data }).select("id, data").single();
  if (insertError || !inserted) {
    // Two requests raced (double tap, page effect + button, webhook/confirm): the unique index
    // documents_one_invoice_per_proposal let only one insert through. Hand back that invoice.
    if ((insertError as { code?: string } | null)?.code === "23505") {
      const { data: again } = await client.from("documents").select("id, type, data").eq("user_id", userId).eq("type", "invoice").eq("data->fromProposal->>id", doc.id);
      const winner = ((again || []) as { id: string; data?: Record<string, unknown> }[]).find((d) => !d.data?.deleted && d.data?.status !== "void");
      if (winner) { await markProposal(winner); return Response.json({ ...linkOf(winner), created: false }); }
    }
    return Response.json({ error: "Could not make the invoice." }, { status: 500 });
  }
  await markProposal(inserted as { id: string; data?: Record<string, unknown> });
  return Response.json({ ...linkOf(inserted as { id: string; data?: Record<string, unknown> }), created: true });
}
