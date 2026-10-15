import { stripeConfig } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner setup help: which Stripe settings the server has. Only yes/no flags and test/live mode;
 * never a key, secret or any part of one.
 */
export async function GET() {
  const config = stripeConfig();
  const mode = config.secretKey.startsWith("sk_live_") ? "live" : config.secretKey.startsWith("sk_test_") ? "test" : config.secretKey ? "unknown" : "";
  return Response.json(
    {
      secretKey: Boolean(config.secretKey),
      webhookSecret: Boolean(config.webhookSecret),
      serviceRoleKey: Boolean(config.serviceKey),
      supabaseUrl: Boolean(config.supabaseUrl),
      mode,
      currency: config.currency,
      checkoutEnabled: config.checkoutEnabled,
      webhookEnabled: config.webhookEnabled,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
