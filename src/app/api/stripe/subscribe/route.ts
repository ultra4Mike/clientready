import { createSubscriptionCheckout, subscriptionsLive, userFromRequest } from "@/lib/stripe-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan subscription checkout for signed-in owners (/plans, Settings > Plan). Same flow as /api/checkout
 * (lib/stripe-server). Off unless STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the plan's price id are set;
 * then the buttons go to trial sign-up / /plans. NOTE: the subscription webhook that unlocks the plan and
 * a cancel / customer portal are still to be built before going live.
 */
export async function GET() {
  const live = subscriptionsLive();
  return Response.json({ enabled: live.monthly || live.quarterly, plans: { monthly: live.monthly, quarterly: live.quarterly }, prices: live.prices }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan === "monthly" || body.plan === "quarterly" ? body.plan : "";
  const live = subscriptionsLive();
  if (!plan || !live[plan]) return Response.json({ error: "Subscriptions are not set up yet." }, { status: 404 });
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  const url = await createSubscriptionCheckout({ price: live.prices[plan], plan, user, successUrl: `${origin}/plans?subscribed=1`, cancelUrl: `${origin}/plans` }).catch(() => "");
  if (!url) return Response.json({ error: "Could not open checkout. Nothing was charged." }, { status: 502 });
  return Response.json({ url });
}
