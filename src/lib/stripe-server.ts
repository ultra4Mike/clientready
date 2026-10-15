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
