// Server-only helpers for Stripe Checkout. Never import from client components.
import { payNowAmount, readStages, todayYmd } from "@/lib/stages";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { amountOf, documentTotals } from "@/lib/discount";
import { owedAfterRefunds, readPayments } from "@/lib/payments";

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

/**
 * Sandbox owners (test accounts): when STRIPE_TEST_SECRET_KEY (sk_test_ only) is set and the invoice's owner id is
 * listed in STRIPE_TEST_OWNER_IDS (comma separated), that owner's client checkouts use the TEST key, so tips and
 * payments can be tried on production without a real charge. Every other owner keeps STRIPE_SECRET_KEY unchanged.
 */
export function sandboxOwner(ownerId: string | null | undefined) {
  const key = process.env.STRIPE_TEST_SECRET_KEY || "";
  if (!ownerId || !key.startsWith("sk_test_")) return false;
  return (process.env.STRIPE_TEST_OWNER_IDS || "").split(",").map((v) => v.trim()).filter(Boolean).includes(ownerId);
}
export function stripeConfigFor(ownerId: string | null | undefined) {
  const base = stripeConfig();
  if (!sandboxOwner(ownerId)) return base;
  const secretKey = process.env.STRIPE_TEST_SECRET_KEY || "";
  return { ...base, secretKey, checkoutEnabled: Boolean(secretKey && base.serviceKey && base.supabaseUrl) };
}
/** Test-mode webhook signing secret (STRIPE_TEST_WEBHOOK_SECRET), used only for livemode:false events. */
export function testWebhookSecret() {
  return (process.env.STRIPE_TEST_SECRET_KEY || "").startsWith("sk_test_") ? process.env.STRIPE_TEST_WEBHOOK_SECRET || "" : "";
}
export async function docOwnerId(docId: string) {
  const { data } = await serviceClient().from("documents").select("user_id").eq("id", docId).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id || null;
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
  return { total: totals.total, owed: owedAfterRefunds(totals.total, readPayments(data), data.status, data.rebillRefund) }; // refund never reopens a balance
}

/** What to charge now: the current payment stage's remainder, or the full balance (no stages / full=true). */
/** chainOwed (Option A revision): owed net of earlier versions' payments, so the plan stages count those credits as paid. */
export function amountToCharge(data: Record<string, unknown>, full: boolean, chainOwed?: number) {
  const { total, owed: ownOwed } = amountsFor(data);
  const owed = typeof chainOwed === "number" ? Math.min(ownOwed, chainOwed) : ownOwed;
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
 * Live only when STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and that plan's price are ALL set: the
 * webhook (/api/stripe/webhook) is what unlocks the plan, so without its secret every plan button stays on
 * trial sign-up. SUPABASE_SERVICE_ROLE_KEY is required too (the webhook writes the plan with it).
 */
export type PlanId = "monthly" | "quarterly";
export function planPrices(): Record<PlanId, string> {
  return {
    monthly: process.env.STRIPE_PRICE_MONTHLY || process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY || "",
    quarterly: process.env.STRIPE_PRICE_QUARTERLY || process.env.NEXT_PUBLIC_STRIPE_PRICE_3MONTHS || "",
  };
}
export function subscriptionsLive() {
  const ready = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
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

/** Stripe client, created lazily inside a request (never at module load). STRIPE_API_BASE points it at a test mock. */
export async function stripeClient() {
  const { default: Stripe } = await import("stripe");
  const { secretKey } = stripeConfig();
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
  return new Stripe(secretKey, base ? { host: base.hostname, port: Number(base.port) || undefined, protocol: base.protocol.replace(":", "") as "http" | "https" } : {});
}

/** Billing state of an owner (service role; never sent to crew). */
export type Billing = { plan: string; status: string; periodEnd: string | null; customer: string; subscription: string };
export async function billingFor(userId: string): Promise<Billing | null> {
  const { data, error } = await serviceClient().from("profiles").select("plan, subscription_status, plan_period_end, stripe_customer_id, stripe_subscription_id").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return { plan: String(data.plan || ""), status: String(data.subscription_status || ""), periodEnd: data.plan_period_end ? String(data.plan_period_end) : null, customer: String(data.stripe_customer_id || ""), subscription: String(data.stripe_subscription_id || "") };
}
/** Statuses that keep saves unlocked (past_due: Stripe is still retrying the card). Same rule as src/lib/trial.ts. */
export const LIVE_STATUSES = ["active", "trialing", "past_due"];

/**
 * Creates the Stripe subscription Checkout session for a signed-in owner. The user id goes in
 * client_reference_id, metadata.user_id and the subscription's metadata (so later subscription and invoice
 * events can be matched too); an owner who subscribed before reuses their Stripe customer, otherwise
 * their email is passed as customer_email.
 */
export async function createSubscriptionCheckout(input: { price: string; plan: string; user: { id: string; email: string }; customer?: string; successUrl: string; cancelUrl: string }) {
  const stripe = await stripeClient();
  const metadata = { plan: input.plan, user_id: input.user.id };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: input.price, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.user.id,
    ...(input.customer ? { customer: input.customer } : input.user.email ? { customer_email: input.user.email } : {}),
    metadata,
    subscription_data: { metadata },
  });
  return session.url || "";
}

/**
 * Shared by /api/checkout and /api/stripe/subscribe: signed-in owners only, one live subscription per owner
 * (a live one is sent to Manage subscription instead), Stripe customer reused when known.
 */
export async function startPlanCheckout(request: Request, plan: PlanId, urls: { successUrl: string; cancelUrl: string }) {
  const user = await userFromRequest(request);
  if (!user) return Response.json({ error: "Sign in or create an account first.", signup: `/signup?plan=${plan}` }, { status: 401 });
  const billing = await billingFor(user.id).catch(() => null);
  if (billing && billing.subscription && LIVE_STATUSES.includes(billing.status)) {
    return Response.json({ error: "You already have an active plan. Use Manage subscription in Settings to change or cancel it.", manage: true }, { status: 409 });
  }
  const url = await createSubscriptionCheckout({ price: planPrices()[plan], plan, user, customer: billing?.customer || "", ...urls }).catch(() => "");
  if (!url) return Response.json({ error: "Could not open checkout. Nothing was charged." }, { status: 502 });
  return Response.json({ url });
}

/** Plan id for a Stripe price id (only the configured monthly / 3-month prices). */
export function planForPrice(price: string): PlanId | "" {
  const prices = planPrices();
  if (price && price === prices.monthly) return "monthly";
  if (price && price === prices.quarterly) return "quarterly";
  return "";
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {});
const str = (value: unknown) => (typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Obj).id === "string" ? String((value as Obj).id) : "");
const time = (value: unknown) => (typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : null);

/** The parts of a Stripe Subscription the app stores. Period end is on the item (API 2025-03-31+) or the subscription (older). */
export function subscriptionFacts(sub: Obj) {
  const items = Array.isArray(obj(sub.items).data) ? (obj(sub.items).data as Obj[]) : [];
  const item = items[0] || {};
  const price = str(item.price) || str(obj(item.plan).id);
  const periodEnd = time(item.current_period_end) || time(sub.current_period_end);
  const metadata = obj(sub.metadata);
  return {
    subscription: str(sub.id),
    customer: str(sub.customer),
    status: typeof sub.status === "string" ? sub.status : "",
    price,
    plan: planForPrice(price) || (metadata.plan === "monthly" || metadata.plan === "quarterly" ? (metadata.plan as PlanId) : ""),
    ours: Boolean(planForPrice(price) || metadata.user_id),
    periodEnd,
    cancelAtPeriodEnd: typeof sub.cancel_at_period_end === "boolean" ? sub.cancel_at_period_end || Boolean(sub.cancel_at) : null,
    userId: typeof metadata.user_id === "string" ? metadata.user_id : "",
  };
}

/** Stripe customer portal session (manage card, switch plan, cancel). */
export async function createPortalSession(customer: string, returnUrl: string) {
  const stripe = await stripeClient();
  const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
  return session.url || "";
}
