import { stripeConfig } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets the customer page know whether card payment is set up. Reveals nothing else. */
export async function GET() {
  return Response.json({ enabled: stripeConfig().checkoutEnabled });
}
