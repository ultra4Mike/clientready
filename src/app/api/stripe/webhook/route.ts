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
};

/**
 * Stripe calls this after a Checkout. A verified, paid session is recorded as a payment on the
 * invoice (once per session). The invoice status is not changed here.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.webhookEnabled) return Response.json({ error: "Webhook is not set up." }, { status: 503 });
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature") || "", config.webhookSecret)) {
    return Response.json({ error: "Bad signature." }, { status: 400 });
  }
  let event: { type?: string; data?: { object?: Session } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Bad payload." }, { status: 400 });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  const session = event.data?.object || {};
  const docId = session.metadata?.doc_id || session.client_reference_id || "";
  if (session.payment_status !== "paid" || !session.id || !docId || !session.amount_total) {
    return Response.json({ received: true, recorded: false });
  }
  const { data, error } = await serviceClient().rpc("record_stripe_payment", {
    p_doc_id: docId,
    p_session_id: session.id,
    p_amount: session.amount_total / 100,
    p_paid_at: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    p_ref: String(session.payment_intent || session.id),
  });
  // A failure returns 500 so Stripe retries; recording is idempotent per session.
  if (error) return Response.json({ error: "Could not record payment." }, { status: 500 });
  return Response.json({ received: true, recorded: Boolean(data) });
}
