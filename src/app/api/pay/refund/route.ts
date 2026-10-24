import { serviceClient, stripeConfig, stripeConfigFor } from "@/lib/stripe-server";
import { isStripeCardPayment, paymentMethods, readPayments, refundableFor } from "@/lib/payments";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status });

/**
 * R2: the owner refunds (part of) one payment on their own invoice.
 * - Card payments taken through Stripe ("stripe_" row with a pi_ ref): a Stripe refund on that PaymentIntent,
 *   idempotent on the request id, then recorded as a negative row (the webhook later sees "duplicate").
 * - Anything else, or when the owner picks "Record only": a manual refund record (money given back outside the app).
 * Body: { docId, paymentId, amount, requestId (uuid), via: "stripe" | "manual", method?, note? }.
 * Owner only (session token + document owner), logged in the document history, partial refunds allowed.
 */
export async function POST(request: Request) {
  const base = stripeConfig();
  if (!base.serviceKey || !base.supabaseUrl) return fail(503, "Refunds aren't available right now.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in first.");
  if (await rateLimitedShared(`refund:${clientIp(request)}`, 10, 60_000)) return tooMany();
  const client = serviceClient();
  const { data: auth } = await client.auth.getUser(token);
  const owner = auth.user;
  if (!owner?.id) return fail(401, "Sign in again, then refund.");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const docId = String(body?.docId || "");
  const paymentId = String(body?.paymentId || "");
  const requestId = String(body?.requestId || "");
  const via = body?.via === "stripe" ? "stripe" : "manual";
  const amount = Math.round(Number(String(body?.amount ?? "").replace(/[^0-9.]/g, "")) * 100) / 100;
  const note = String(body?.note || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300);
  if (!UUID.test(docId) || !paymentId || !UUID.test(requestId)) return fail(400, "Save the invoice first, then refund.");
  if (!(amount > 0)) return fail(400, "Enter the amount to refund.");

  const { data: doc } = await client.from("documents").select("id, type, user_id, data").eq("id", docId).eq("user_id", owner.id).maybeSingle();
  if (!doc || doc.type !== "invoice") return fail(404, "Invoice not found in your account.");
  const payments = readPayments(doc.data as never);
  const payment = payments.find((row) => row.id === paymentId);
  if (!payment) return fail(404, "That payment isn't saved on the invoice yet. Save the invoice first.");
  const left = refundableFor(payments, paymentId);
  if (amount > left + 0.004) return fail(400, left > 0 ? `You can refund up to $${left.toFixed(2)} of this payment.` : "This payment has already been refunded.", { left });
  const meta = (owner.user_metadata || {}) as Record<string, unknown>;
  const by = String(meta.full_name || meta.name || owner.email || "Owner").slice(0, 80);

  let refundId = `manual_${requestId}`;
  let method = String(body?.method || "").trim();
  let ref = "";
  if (via === "stripe") {
    if (!isStripeCardPayment(payment)) return fail(400, "Only card payments taken through ClientReady can be refunded to the card. Use Record a refund instead.");
    const config = stripeConfigFor(owner.id);
    if (!config.secretKey) return fail(503, "Card payments aren't set up, so a card refund can't be sent. Refund in Stripe or record a manual refund.");
    const form = new URLSearchParams({ payment_intent: payment.ref, amount: String(Math.round(amount * 100)), "metadata[doc_id]": docId, "metadata[owner_id]": owner.id, "metadata[payment_id]": paymentId, reason: "requested_by_customer" });
    const response = await fetch(`${config.apiBase}/v1/refunds`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `cr-refund-${requestId}` },
      body: form,
    }).catch(() => null);
    const refund = (response ? await response.json().catch(() => null) : null) as { id?: string; status?: string; error?: { message?: string } } | null;
    if (!response?.ok || !refund?.id) return fail(502, `Stripe did not refund it${refund?.error?.message ? `: ${refund.error.message}` : "."} Nothing was changed.`);
    if (refund.status !== "succeeded") return Response.json({ result: "pending", message: "Stripe accepted the refund. It will show here once Stripe confirms it." });
    refundId = String(refund.id);
    method = "Card refund (Stripe)";
    ref = payment.ref;
  } else if (!paymentMethods.includes(method)) {
    return fail(400, "Choose how the money was given back (Method).");
  }

  const { data, error } = await client.rpc("record_owner_refund", {
    p_owner: owner.id, p_doc: docId, p_payment_id: paymentId, p_refund_id: refundId, p_amount: amount,
    p_method: via === "stripe" ? method : `Refund (${method})`, p_note: note, p_by: by, p_ref: ref,
    p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago",
  });
  if (error) return fail(500, via === "stripe" ? "The card was refunded, but it couldn't be saved yet. It will appear when Stripe reports it." : "Could not save the refund. Nothing was changed.");
  const out = (data || {}) as { result?: string; data?: Record<string, unknown>; left?: number };
  if (out.result === "recorded" || out.result === "duplicate") return Response.json({ result: out.result, data: out.data });
  if (out.result === "over_refund") return fail(400, `You can refund up to $${Number(out.left || 0).toFixed(2)} of this payment.`, { left: out.left });
  return fail(400, "Could not save the refund. Nothing was changed.");
}
