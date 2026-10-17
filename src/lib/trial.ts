import { supabase } from "@/lib/supabase";

export type TrialState = {
  expired: boolean;
  daysLeft: number;
  plan: string;
  /** Stripe subscription status ('' when none), set by the webhook. */
  status?: string;
  periodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  /** Has a Stripe customer (can open the customer portal). */
  billing?: boolean;
};

const LIVE = ["active", "trialing", "past_due"];
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A paid subscription keeps saves unlocked while Stripe says active / trialing / past_due (card being
 * retried) and the period has not ended more than 3 days ago (a missed renewal event cannot unlock forever).
 */
export function subscriptionUnlocks(plan: string, status: string, periodEnd: string | null | undefined, now = Date.now()) {
  if (plan !== "monthly" && plan !== "quarterly") return false;
  if (!LIVE.includes(status)) return false;
  const end = periodEnd ? new Date(periodEnd).getTime() : NaN;
  return !Number.isFinite(end) || end + GRACE_MS > now;
}

type ProfileBilling = { plan?: string | null; subscription_status?: string | null; plan_period_end?: string | null; cancel_at_period_end?: boolean | null; stripe_customer_id?: string | null };

export async function getTrialState(): Promise<TrialState> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { expired: false, daysLeft: 14, plan: "trial" };

  const first = await supabase
    .from("profiles")
    .select("plan, subscription_status, plan_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle<ProfileBilling>();
  let profile = first.data;
  // Before migration 20261017120000 runs: only the plan column exists.
  if (first.error) profile = (await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle<ProfileBilling>()).data;

  const plan = profile?.plan || "trial";
  const status = profile?.subscription_status || "";
  const extra = { status, periodEnd: profile?.plan_period_end || null, cancelAtPeriodEnd: Boolean(profile?.cancel_at_period_end), billing: Boolean(profile?.stripe_customer_id) };
  if (plan === "owner" || plan === "active" || subscriptionUnlocks(plan, status, profile?.plan_period_end)) {
    return { expired: false, daysLeft: 999, plan, ...extra };
  }

  const started = new Date(user.created_at).getTime();
  const ends = started + 14 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(Math.ceil((ends - Date.now()) / (24 * 60 * 60 * 1000)), 0);
  return { expired: Date.now() > ends, daysLeft, plan, ...extra };
}
