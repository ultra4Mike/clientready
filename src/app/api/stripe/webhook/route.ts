import { handleSubscriptionEvent, SUBSCRIPTION_EVENTS } from "@/lib/stripe-subscription-events";
import { sandboxOwner, serviceClient, stripeConfig, testWebhookSecret, verifyStripeSignature } from "@/lib/stripe-server";
import { currencyOk, fromMinor } from "@/lib/stripe-money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = {
  id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  created?: number;
  payment_intent?: string | null;
  metadata?: { doc_id?: string; owed_cents?: string; owner_id?: string; tip_cents?: string };
  client_reference_id?: string | null;
  mode?: string;
};

/**
 * Stripe calls this (signature checked with STRIPE_WEBHOOK_SECRET).
 * - Plan subscriptions: checkout.session.completed (mode subscription), customer.subscription.updated /
 *   .deleted and invoice.payment_failed set the owner's plan (lib/stripe-subscription-events), once per event.
 * - Invoice payments: a verified, paid Checkout session (mode payment) is recorded as a payment on the
 *   invoice (once per session). The invoice status is not changed here.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.webhookEnabled) return Response.json({ error: "Webhook is not set up." }, { status: 503 });
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const liveOk = verifyStripeSignature(payload, signature, config.webhookSecret);
  const testSecret = testWebhookSecret();
  const testOk = !liveOk && Boolean(testSecret) && verifyStripeSignature(payload, signature, testSecret);
  if (!liveOk && !testOk) {
    return Response.json({ error: "Bad signature." }, { status: 400 });
  }
  let event: { id?: string; type?: string; created?: number; data?: { object?: Session } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Bad payload." }, { status: 400 });
  }
  // Test-mode: only one-off invoice checkouts are handled (no plans, refunds); the rest is acknowledged.
  if (testOk && !(event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") ) return Response.json({ received: true, ignored: "test event" });
  if (testOk && event.data?.object?.mode === "subscription") return Response.json({ received: true, ignored: "test event" });
  const isPlanCheckout = event.type === "checkout.session.completed" && event.data?.object?.mode === "subscription";
  if (isPlanCheckout || (event.type && event.type !== "checkout.session.completed" && SUBSCRIPTION_EVENTS.includes(event.type))) {
    const result = await handleSubscriptionEvent(event as Parameters<typeof handleSubscriptionEvent>[0]);
    return Response.json(result.body, { status: result.status });
  }
  if (event.type === "charge.refunded" || event.type === "refund.updated" || event.type === "refund.created") return handleRefund(event as RefundEvent, config);
  if (event.type === "checkout.session.async_payment_failed") {
    // R95: the bank payment failed. Nothing was paid; the open checkout is closed so the client can try again.
    const failed = event.data?.object || {};
    if (failed.id) await serviceClient().from("stripe_checkout_sessions").update({ status: "failed" }).eq("session_id", String(failed.id));
    return Response.json({ received: true, recorded: false });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  const session = event.data?.object || {};
  // Test-mode events (signed with the test secret) only count for sandbox owners; never for real accounts.
  if (testOk && !sandboxOwner(String(session.metadata?.owner_id || ""))) return Response.json({ received: true, recorded: false, ignored: "test event for a non-sandbox owner" });
  const docId = session.metadata?.doc_id || session.client_reference_id || "";
  if (session.payment_status !== "paid" || !session.id || !session.amount_total) {
    return Response.json({ received: true, recorded: false });
  }
  // R128: the payment date is when it was paid (the event), not when checkout was opened (could be the day before).
  const paidAt = new Date((event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const ref = String(session.payment_intent || session.id);
  const client = serviceClient();
  const park = async (reason: string, amount: number) => {
    await client.rpc("park_stripe_payment", { p_session_id: session.id, p_doc_id: docId, p_amount: amount, p_at: paidAt, p_ref: ref, p_event_id: String(event.id || ""), p_reason: reason });
    // 200: Stripe must not retry a payment we chose to hold for the owner to review.
    return Response.json({ received: true, recorded: false, parked: reason });
  };
  // R96: only the app's currency (USD) is recorded; anything else is parked, never converted.
  if (!currencyOk(session.currency, config.currency)) return park(`currency ${String(session.currency || "?")} not recorded`, fromMinor(session.amount_total, String(session.currency || "")));
  // R97: the payment must match the checkout this app started (same invoice, same amount).
  const { data: started, error: startedError } = await client.from("stripe_checkout_sessions").select("doc_id, cents").eq("session_id", session.id).maybeSingle();
  const startedRow = started as { doc_id?: string; cents?: number } | null;
  const metaCents = Number(session.metadata?.owed_cents || "");
  // Tip: charged as its own line; the invoice part is amount_total minus the tip (metadata we set, signed by Stripe).
  const tipPart = Math.max(0, Math.floor(Number(session.metadata?.tip_cents || 0)) || 0);
  const billCents = session.amount_total - tipPart;
  if (startedError || !startedRow || String(startedRow.doc_id) !== String(docId) || Number(startedRow.cents) !== billCents || (metaCents && metaCents !== billCents)) {
    return park("no matching checkout for this invoice and amount", fromMinor(session.amount_total, String(session.currency || "")));
  }
  const v2 = await client.rpc("record_stripe_payment_v2", {
    p_doc_id: docId,
    p_session_id: session.id,
    p_amount: fromMinor(billCents, String(session.currency || "usd")),
    p_paid_at: paidAt,
    p_ref: ref,
    p_event_id: String(event.id || ""),
    p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago",
  });
  if (!v2.error) {
    // 'pending': invoice missing or not synced yet. It is saved in stripe_pending_payments; a non-2xx
    // makes Stripe retry (for up to ~3 days), and a later retry records it once (idempotent).
    if (v2.data === "pending") return Response.json({ error: "Invoice not found yet; payment kept as pending." }, { status: 409 });
    if (tipPart > 0 && (v2.data === "recorded" || v2.data === "duplicate")) await recordTip(client, docId, session.id, fromMinor(tipPart, String(session.currency || "usd")));
    return Response.json({ received: true, recorded: v2.data === "recorded" || v2.data === "duplicate" });
  }
  // Before migration 20261015130000 runs, fall back to the original function (UTC date).
  const { data, error } = await client.rpc("record_stripe_payment", {
    p_doc_id: docId,
    p_session_id: session.id,
    p_amount: fromMinor(billCents, String(session.currency || "usd")),
    p_paid_at: paidAt,
    p_ref: ref,
  });
  // A failure or a missing invoice returns non-2xx so Stripe retries; recording is idempotent per session.
  if (error || !data) return Response.json({ error: "Could not record payment." }, { status: error ? 500 : 409 });
  return Response.json({ received: true, recorded: true });
}

/** Adds the tip to the Stripe payment row (deploy26.sql). Before that SQL runs the tip stays only in Stripe. */
async function recordTip(client: ReturnType<typeof serviceClient>, docId: string, sessionId: string, tip: number) {
  await client.rpc("set_stripe_payment_tip", { p_doc_id: docId, p_session_id: sessionId, p_tip: tip }).then(() => null, () => null);
}

type Refund = { id?: string; amount?: number; currency?: string; status?: string; created?: number; payment_intent?: string | null; charge?: string | null };
type RefundEvent = { id?: string; type?: string; data?: { object?: Refund & { refunds?: { data?: Refund[] }; object?: string } } };

/** R95: a Stripe refund becomes one negative payment row on the invoice (doc from the PaymentIntent's metadata). */
async function handleRefund(event: RefundEvent, config: ReturnType<typeof stripeConfig>) {
  const object = event.data?.object || {};
  const refunds: Refund[] = event.type === "charge.refunded" ? (object.refunds?.data || []).map((item) => ({ ...item, payment_intent: item.payment_intent || object.payment_intent })) : [object];
  const done = refunds.filter((item) => item.id && item.status === "succeeded" && (item.amount || 0) > 0);
  if (!done.length) return Response.json({ received: true, recorded: false });
  const client = serviceClient();
  let pending = false;
  for (const refund of done) {
    const pi = String(refund.payment_intent || "");
    const intent = pi ? await fetch(`${config.apiBase}/v1/payment_intents/${encodeURIComponent(pi)}`, { headers: { Authorization: `Bearer ${config.secretKey}` } }).then((res) => (res.ok ? res.json() : null)).catch(() => null) as { metadata?: { doc_id?: string } } | null : null;
    const docId = String(intent?.metadata?.doc_id || "");
    const at = new Date((refund.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
    if (!currencyOk(refund.currency, config.currency)) {
      await client.rpc("park_stripe_payment", { p_session_id: `refund_${refund.id}`, p_doc_id: docId, p_amount: -fromMinor(refund.amount || 0, String(refund.currency || "")), p_at: at, p_ref: pi, p_event_id: String(event.id || ""), p_reason: `refund currency ${String(refund.currency || "?")} not recorded` });
      continue;
    }
    const { data, error } = await client.rpc("record_stripe_refund", { p_doc_id: docId, p_refund_id: String(refund.id), p_amount: fromMinor(refund.amount || 0, "usd"), p_at: at, p_ref: pi, p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago" });
    if (error) return Response.json({ error: "Could not record refund." }, { status: 500 });
    if (data === "pending") pending = true;
  }
  if (pending) return Response.json({ error: "Invoice not found yet; refund kept as pending." }, { status: 409 });
  return Response.json({ received: true, recorded: true });
}
