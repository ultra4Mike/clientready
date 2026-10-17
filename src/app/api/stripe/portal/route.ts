import { billingFor, createPortalSession, stripeConfig, userFromRequest } from "@/lib/stripe-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST (owner's Bearer token) -> { url } of a Stripe customer portal session for their own Stripe customer
 * (update card, switch plan, cancel). The customer id is read server-side from the owner's profile, never
 * taken from the request. Returns to Settings > Plan.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.secretKey || !config.serviceKey || !config.supabaseUrl) return Response.json({ error: "Billing is not set up." }, { status: 503 });
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Log in first." }, { status: 401 });
  const billing = await billingFor(user.id).catch(() => null);
  if (!billing?.customer) return Response.json({ error: "No subscription found for this account." }, { status: 404 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  const url = await createPortalSession(billing.customer, `${origin}/profile#plan`).catch(() => "");
  if (!url) return Response.json({ error: "Could not open subscription settings. Try again." }, { status: 502 });
  return Response.json({ url });
}
