import { handleSubscriptionEvent, SUBSCRIPTION_EVENTS } from "@/lib/stripe-subscription-events";
import { serviceClient, stripeConfig, verifyStripeSignature } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = {
  id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  created?: number;
  payment_intent?: string | null;
  metadata?: { doc_id?: string };
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
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature") || "", config.webhookSecret)) {
    return Response.json({ error: "Bad signature." }, { status: 400 });
  }
  let event: { id?: string; type?: string; created?: number; data?: { object?: Session } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Bad payload." }, { status: 400 });
  }
  const isPlanCheckout = event.type === "checkout.session.completed" && event.data?.object?.mode === "subscription";
  if (isPlanCheckout || (event.type && event.type !== "checkout.session.completed" && SUBSCRIPTION_EVENTS.includes(event.type))) {
    const result = await handleSubscriptionEvent(event as Parameters<typeof handleSubscriptionEvent>[0]);
    return Response.json(result.body, { status: result.status });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  const session = event.data?.object || {};
  const docId = session.metadata?.doc_id || session.client_reference_id || "";
  if (session.payment_status !== "paid" || !session.id || !session.amount_total) {
    return Response.json({ received: true, recorded: false });
  }
  const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const ref = String(session.payment_intent || session.id);
  const client = serviceClient();
  const v2 = await client.rpc("record_stripe_payment_v2", {
    p_doc_id: docId,
    p_session_id: session.id,
    p_amount: session.amount_total / 100,
    p_paid_at: paidAt,
    p_ref: ref,
    p_event_id: String(event.id || ""),
    p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago",
  });
  if (!v2.error) {
    // 'pending': invoice missing or not synced yet. It is saved in stripe_pending_payments; a non-2xx
    // makes Stripe retry (for up to ~3 days), and a later retry records it once (idempotent).
    if (v2.data === "pending") return Response.json({ error: "Invoice not found yet; payment kept as pending." }, { status: 409 });
    return Response.json({ received: true, recorded: v2.data === "recorded" || v2.data === "duplicate" });
  }
  // Before migration 20261015130000 runs, fall back to the original function (UTC date).
  const { data, error } = await client.rpc("record_stripe_payment", {
    p_doc_id: docId,
    p_session_id: session.id,
    p_amount: session.amount_total / 100,
    p_paid_at: paidAt,
    p_ref: ref,
  });
  // A failure or a missing invoice returns non-2xx so Stripe retries; recording is idempotent per session.
  if (error || !data) return Response.json({ error: "Could not record payment." }, { status: error ? 500 : 409 });
  return Response.json({ received: true, recorded: true });
}
