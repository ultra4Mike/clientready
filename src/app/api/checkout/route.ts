import { createSubscriptionCheckout, planPrices, subscriptionsLive, userFromRequest } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Home page plan checkout: POST { priceId } -> { url }. Same flow as /api/stripe/subscribe
 * (lib/stripe-server, Stripe created lazily per request). 503 when STRIPE_SECRET_KEY is missing; only the
 * configured monthly / 3-month price ids are accepted, and only while subscriptions are live (secret key,
 * webhook secret and price all set). There is no /pricing page, so cancel returns to /plans?canceled=true.
 * A signed-in owner's Bearer token (optional) links the session to their account for the future webhook.
 */
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) return Response.json({ error: "Checkout not configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { priceId?: unknown };
  const priceId = typeof body.priceId === "string" ? body.priceId : "";
  const prices = planPrices();
  const plan = priceId && priceId === prices.monthly ? "monthly" : priceId && priceId === prices.quarterly ? "quarterly" : "";
  if (!plan) return Response.json({ error: "Unknown plan" }, { status: 400 });
  if (!subscriptionsLive()[plan]) return Response.json({ error: "Checkout not configured" }, { status: 503 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://clientreadyapp.com").replace(/\/+$/, "");
  const url = await createSubscriptionCheckout({ price: priceId, plan, user: await userFromRequest(request), successUrl: `${site}/dashboard?success=true`, cancelUrl: `${site}/plans?canceled=true` }).catch(() => "");
  if (!url) return Response.json({ error: "Could not open checkout. Nothing was charged." }, { status: 502 });
  return Response.json({ url });
}
