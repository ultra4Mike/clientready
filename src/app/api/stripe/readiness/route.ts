import { stripeConfig, userFromRequest } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner setup help: which Stripe settings the server has. Only yes/no flags and test/live mode;
 * never a key, secret or any part of one. Signed-out callers only learn whether card checkout is on;
 * the setup details need a valid Supabase session (Authorization: Bearer <access token>).
 */
export async function GET(request: Request) {
  const config = stripeConfig();
  const headers = { "cache-control": "no-store" };
  const enabled = Boolean(config.checkoutEnabled);
  const user = await userFromRequest(request).catch(() => null);
  if (!user) return Response.json({ enabled }, { headers });
  const mode = config.secretKey.startsWith("sk_live_") ? "live" : config.secretKey.startsWith("sk_test_") ? "test" : config.secretKey ? "unknown" : "";
  return Response.json(
    {
      enabled,
      secretKey: Boolean(config.secretKey),
      webhookSecret: Boolean(config.webhookSecret),
      serviceRoleKey: Boolean(config.serviceKey),
      supabaseUrl: Boolean(config.supabaseUrl),
      mode,
      currency: config.currency,
      checkoutEnabled: config.checkoutEnabled,
      webhookEnabled: config.webhookEnabled,
    },
    { headers }
  );
}
