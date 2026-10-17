// Server-only helpers for Stripe Checkout. Never import from client components.
import { payNowAmount, readStages, todayYmd } from "@/lib/stages";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, paidTotal, readPayments } from "@/lib/payments";

export function stripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const apiBase = (process.env.STRIPE_API_BASE || "https://api.stripe.com").replace(/\/$/, "");
  const currency = (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
  return {
    secretKey, webhookSecret, serviceKey, supabaseUrl, apiBase, currency,
    checkoutEnabled: Boolean(secretKey && serviceKey && supabaseUrl),
    webhookEnabled: Boolean(webhookSecret && serviceKey && supabaseUrl),
  };
}

/** Service-role client: only used for the two Stripe functions, which only the service role may call. */
export function serviceClient() {
  const { supabaseUrl, serviceKey } = stripeConfig();
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Still owed on a document, with the same math the app uses everywhere. */
export function stillOwed(data: Record<string, unknown>) {
  return amountsFor(data).owed;
}

function amountsFor(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? (data.items as { qty?: unknown; rate?: unknown }[]) : [];
  const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
  const totals = documentTotals(subtotal, String(data.taxPercent ?? ""), String(data.discountType ?? ""), String(data.discountValue ?? ""));
  return { total: totals.total, owed: balanceDue(totals.total, paidTotal(readPayments(data)), data.status) };
}

/** What to charge now: the current payment stage's remainder, or the full balance (no stages / full=true). */
export function amountToCharge(data: Record<string, unknown>, full: boolean) {
  const { total, owed } = amountsFor(data);
  const stages = readStages(data.stages);
  return { owed, charge: payNowAmount(total, owed, stages, todayYmd(), full), staged: stages.length > 0 && !full };
}

/** Verifies a Stripe-Signature header (v1 HMAC-SHA256 over "timestamp.payload"), with a 5 minute window. */
export function verifyStripeSignature(payload: string, header: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const t = parts.find(([key]) => key === "t")?.[1] || "";
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value || "");
  const timestamp = Number(t);
  if (!timestamp || Math.abs(nowSeconds - timestamp) > 300 || !signatures.length) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const b = Buffer.from(sig, "hex");
    return b.length === a.length && timingSafeEqual(a, b);
  });
}

/**
 * Plan subscriptions (one flow for /api/stripe/subscribe and /api/checkout). Price ids come from
 * STRIPE_PRICE_MONTHLY / STRIPE_PRICE_QUARTERLY, or NEXT_PUBLIC_STRIPE_PRICE_MONTHLY / _3MONTHS.
 * Live only when STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and that plan's price are ALL set: a paid
 * subscription does not unlock the plan until the subscription webhook exists, so without the webhook
 * secret every plan button stays on trial sign-up.
 */
export type PlanId = "monthly" | "quarterly";
export function planPrices(): Record<PlanId, string> {
  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY || process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY || "",
    quarterly: process.env.STRIPE_PRICE_QUARTERLY || process.env.NEXT_PUBLIC_STRIPE_PRICE_3MONTHS || "",
  };
}
export function subscriptionsLive() {
  const ready = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  const prices = planPrices();
  return { monthly: ready && Boolean(prices.monthly), quarterly: ready && Boolean(prices.quarterly), prices: { monthly: ready ? prices.monthly : "", quarterly: ready ? prices.quarterly : "" } };
}

/** The signed-in owner behind a Bearer token, or null (anonymous visitors on the home page). */
export async function userFromRequest(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { supabaseUrl } = stripeConfig();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!token || !supabaseUrl || !anon) return null;
  const { data, error } = await createClient(supabaseUrl, anon, { auth: { persistSession: false } }).auth.getUser(token).catch(() => ({ data: { user: null }, error: true }));
  return error || !data.user ? null : { id: data.user.id, email: data.user.email || "" };
}

/**
 * Creates the Stripe subscription Checkout session. Stripe is created here (lazily), never at module
 * load, so builds and pages work with no Stripe env. The owner's user id goes in client_reference_id and
 * metadata.user_id (and their email as customer_email) so the future webhook can unlock the plan.
 */
export async function createSubscriptionCheckout(input: { price: string; plan: string; user: { id: string; email: string } | null; successUrl: string; cancelUrl: string }) {
  const { default: Stripe } = await import("stripe");
  const { secretKey } = stripeConfig();
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  const stripe = new Stripe(secretKey, base ? { host: base.hostname, port: Number(base.port) || undefined, protocol: base.protocol.replace(":", "") as "http" | "https" } : {});
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    ...(input.user ? { client_reference_id: input.user.id, customer_email: input.user.email || undefined } : {}),
    metadata: { plan: input.plan, ...(input.user ? { user_id: input.user.id } : {}) },
  });
  return session.url || "";
}
