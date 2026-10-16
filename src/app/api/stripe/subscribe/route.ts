import { createClient } from "@supabase/supabase-js";
import { stripeConfig } from "@/lib/stripe-server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Plan subscription checkout. Only on when STRIPE_SECRET_KEY and a price id for the plan
 * (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_QUARTERLY) are set; otherwise /plans buttons go to trial sign-up.
 * NOTE: turning a paid subscription into an unlocked plan (webhook -> profile) is added with Stripe later.
 */
const priceFor = (plan: string) => (plan === "monthly" ? process.env.STRIPE_PRICE_MONTHLY : plan === "quarterly" ? process.env.STRIPE_PRICE_QUARTERLY : "") || "";
const enabled = () => Boolean(stripeConfig().secretKey && (priceFor("monthly") || priceFor("quarterly")));

export async function GET() {
  return Response.json({ enabled: enabled(), plans: { monthly: Boolean(stripeConfig().secretKey && priceFor("monthly")), quarterly: Boolean(stripeConfig().secretKey && priceFor("quarterly")) } }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const config = stripeConfig();
  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  const price = priceFor(String(body.plan || ""));
  if (!config.secretKey || !price) return Response.json({ error: "Subscriptions are not set up yet." }, { status: 404 });
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!token || !config.supabaseUrl || !anon) return Response.json({ error: "Log in first." }, { status: 401 });
  const { data, error } = await createClient(config.supabaseUrl, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Log in first." }, { status: 401 });
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || SITE_URL).replace(/\/+$/, "");
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: data.user.id,
    success_url: `${origin}/plans?subscribed=1`,
    cancel_url: `${origin}/plans`,
    "metadata[user_id]": data.user.id,
    "metadata[plan]": String(body.plan),
  });
  if (data.user.email) form.set("customer_email", data.user.email);
  const response = await fetch(`${config.apiBase}/v1/checkout/sessions`, { method: "POST", headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: form }).catch(() => null);
  const session = (await response?.json().catch(() => null)) as { url?: string } | null;
  if (!response?.ok || !session?.url) return Response.json({ error: "Could not open checkout. Nothing was charged." }, { status: 502 });
  return Response.json({ url: session.url });
}
