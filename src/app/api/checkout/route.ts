import { planPrices, startPlanCheckout, subscriptionsLive } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Home page plan checkout: POST { priceId } with the owner's Bearer token -> { url }. Same flow as
 * /api/stripe/subscribe (lib/stripe-server). 503 when STRIPE_SECRET_KEY is missing; only the configured
 * monthly / 3-month price ids are accepted, and only while subscriptions are live (secret key, webhook
 * secret, service role key and price all set). Anonymous visitors get 401 with a sign-up link carrying the
 * plan, so every subscription has a user id. Cancel returns to /plans?canceled=true.
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
  return startPlanCheckout(request, plan, { successUrl: `${site}/dashboard?success=true`, cancelUrl: `${site}/plans?canceled=true` });
}
