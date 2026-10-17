import { startPlanCheckout, stripeConfig, subscriptionsLive } from "@/lib/stripe-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan subscription checkout for signed-in owners (/plans, Settings > Plan, /subscribe after sign-up). Same
 * flow as /api/checkout (lib/stripe-server). Off unless STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * SUPABASE_SERVICE_ROLE_KEY and the plan's price id are set; then the buttons go to trial sign-up / /plans.
 * The webhook unlocks the plan; /api/stripe/portal is the manage / cancel path.
 */
export async function GET() {
  const live = subscriptionsLive();
  const config = stripeConfig();
  return Response.json({ enabled: live.monthly || live.quarterly, plans: { monthly: live.monthly, quarterly: live.quarterly }, prices: live.prices, portal: Boolean(config.secretKey && config.serviceKey && config.supabaseUrl) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan === "monthly" || body.plan === "quarterly" ? body.plan : "";
  const live = subscriptionsLive();
  if (!plan || !live[plan]) return Response.json({ error: "Subscriptions are not set up yet." }, { status: 404 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  return startPlanCheckout(request, plan, { successUrl: `${origin}/plans?subscribed=1`, cancelUrl: `${origin}/plans` });
}
