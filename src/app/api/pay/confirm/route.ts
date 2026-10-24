import { serviceClient, stripeConfig } from "@/lib/stripe-server";
import { currencyOk, fromMinor } from "@/lib/stripe-money";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R128: right after Stripe sends the client back (?paid=1&cs=<session>), the page asks here instead of
 * "it can take a minute". The session is read from Stripe; when it is paid, belongs to this link's
 * invoice and matches the checkout this app started, it is recorded now with the same idempotent
 * function the webhook uses (a later webhook is a no-op "duplicate"). Returns the payment row id so
 * the page can show the receipt.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.checkoutEnabled) return Response.json({ error: "Card payment is not set up." }, { status: 503 });
  if (await rateLimitedShared(`confirm:${clientIp(request)}`, 30, 60_000)) return tooMany();
  let token = "", portal = "", docId = "", cs = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    token = String(body.token || ""); portal = String(body.portal || ""); docId = String(body.docId || ""); cs = String(body.cs || "");
  } catch { /* empty */ }
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(cs)) return Response.json({ error: "Unknown payment." }, { status: 400 });
  const viaPortal = portal.length >= 32 && /^[0-9a-f-]{36}$/i.test(docId);
  if (!viaPortal && token.length < 32) return Response.json({ error: "Link not found." }, { status: 404 });
  const client = serviceClient();
  const { data: rows } = viaPortal
    ? await client.rpc("stripe_invoice_for_portal", { p_token: portal, p_doc_id: docId })
    : await client.rpc("stripe_invoice_for_token", { p_token: token });
  const doc = (Array.isArray(rows) ? rows[0] : rows) as { id: string; type: string } | null;
  if (!doc || doc.type !== "invoice") return Response.json({ error: "Link not found." }, { status: 404 });
  const session = await fetch(`${config.apiBase}/v1/checkout/sessions/${encodeURIComponent(cs)}`, { headers: { Authorization: `Bearer ${config.secretKey}` } })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id?: string; payment_status?: string; amount_total?: number; currency?: string; created?: number; payment_intent?: string | null; metadata?: { doc_id?: string } } | null;
  if (!session || session.metadata?.doc_id !== String(doc.id)) return Response.json({ error: "Unknown payment." }, { status: 404 });
  if (session.payment_status !== "paid" || !session.amount_total) return Response.json({ paid: false, status: session.payment_status || "open" });
  if (!currencyOk(session.currency, config.currency)) return Response.json({ paid: true, recorded: false });
  const { data: started } = await client.from("stripe_checkout_sessions").select("doc_id, cents").eq("session_id", cs).maybeSingle();
  const row = started as { doc_id?: string; cents?: number } | null;
  if (!row || String(row.doc_id) !== String(doc.id) || Number(row.cents) !== session.amount_total) return Response.json({ paid: true, recorded: false });
  const result = await client.rpc("record_stripe_payment_v2", {
    p_doc_id: String(doc.id), p_session_id: cs, p_amount: fromMinor(session.amount_total, String(session.currency || "usd")),
    p_paid_at: new Date().toISOString(),
    p_ref: String(session.payment_intent || cs), p_event_id: "", p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago",
  });
  return Response.json({ paid: true, recorded: !result.error && (result.data === "recorded" || result.data === "duplicate"), paymentId: `stripe_${cs}` });
}
