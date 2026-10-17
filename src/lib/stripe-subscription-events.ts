// Server-only: plan subscription webhook events -> the owner's profile (service role). Never import from client components.
import { serviceClient, stripeClient, subscriptionFacts, planForPrice } from "@/lib/stripe-server";

export const SUBSCRIPTION_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed"];

type Obj = Record<string, unknown>;
type StripeEvent = { id?: string; type?: string; created?: number; data?: { object?: Obj } };
type Change = { userId: string; email: string; customer: string; subscription: string; plan: string; status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean | null; ours: boolean };

const obj = (value: unknown): Obj => (value && typeof value === "object" ? (value as Obj) : {});
const str = (value: unknown) => (typeof value === "string" ? value : value && typeof value === "object" && typeof (value as Obj).id === "string" ? String((value as Obj).id) : "");

/** Reads the live subscription (needs Subscriptions: Read on a restricted key). Null if that fails. */
async function retrieveSubscription(id: string) {
  if (!id) return null;
  try {
    const stripe = await stripeClient();
    return (await stripe.subscriptions.retrieve(id)) as unknown as Obj;
  } catch {
    return null;
  }
}

async function changeFor(type: string, object: Obj): Promise<Change | null> {
  if (type === "checkout.session.completed") {
    const metadata = obj(object.metadata);
    const subscriptionId = str(object.subscription);
    const live = await retrieveSubscription(subscriptionId);
    const facts = live ? subscriptionFacts(live) : null;
    const metaPlan = metadata.plan === "monthly" || metadata.plan === "quarterly" ? String(metadata.plan) : "";
    const paid = object.payment_status === "paid" || object.payment_status === "no_payment_required" || object.status === "complete";
    return {
      userId: String(metadata.user_id || object.client_reference_id || facts?.userId || ""),
      email: String(obj(object.customer_details).email || object.customer_email || ""),
      customer: str(object.customer) || facts?.customer || "",
      subscription: subscriptionId,
      plan: facts?.plan || metaPlan,
      // Without Subscriptions: Read, a completed, paid session still unlocks; the next subscription event fills in the rest.
      status: facts?.status || (paid ? "active" : "incomplete"),
      periodEnd: facts?.periodEnd || null,
      cancelAtPeriodEnd: facts?.cancelAtPeriodEnd ?? null,
      ours: Boolean(metaPlan || metadata.user_id || facts?.ours),
    };
  }
  if (type.startsWith("customer.subscription.")) {
    const facts = subscriptionFacts(object);
    return {
      userId: facts.userId, email: "", customer: facts.customer, subscription: facts.subscription, plan: facts.plan,
      status: type === "customer.subscription.deleted" ? "canceled" : facts.status,
      periodEnd: facts.periodEnd, cancelAtPeriodEnd: type === "customer.subscription.deleted" ? false : facts.cancelAtPeriodEnd, ours: facts.ours,
    };
  }
  if (type === "invoice.payment_failed") {
    // Subscription id: invoice.parent.subscription_details (API 2025-03-31+) or invoice.subscription (older).
    const details = obj(obj(object.parent).subscription_details);
    const subscription = str(details.subscription) || str(object.subscription);
    if (!subscription) return null; // a one-off invoice, not a plan
    const metadata = obj(details.metadata);
    const lines = Array.isArray(obj(object.lines).data) ? (obj(object.lines).data as Obj[]) : [];
    const line = lines[0] || {};
    const price = str(obj(obj(line.pricing).price_details).price) || str(line.price);
    return {
      userId: String(metadata.user_id || ""), email: String(object.customer_email || ""), customer: str(object.customer), subscription,
      plan: planForPrice(price), status: "past_due", periodEnd: null, cancelAtPeriodEnd: null,
      ours: Boolean(planForPrice(price) || metadata.user_id),
    };
  }
  return null;
}

/**
 * Applies one plan event. Idempotent by event id (apply_plan_subscription records it). Events for other
 * products on the same Stripe account (not our price, no user id) are acknowledged and ignored. A database
 * failure returns 500 so Stripe retries.
 */
export async function handleSubscriptionEvent(event: StripeEvent): Promise<{ status: number; body: Obj }> {
  const type = String(event.type || "");
  if (!event.id) return { status: 400, body: { error: "Bad payload." } };
  const change = await changeFor(type, obj(event.data?.object));
  if (!change) return { status: 200, body: { received: true, plan: "ignored" } };
  if (!change.ours && !change.userId) {
    // Could still be ours if the profile already holds this subscription / customer; let the database decide only then.
    const known = await serviceClient().from("profiles").select("id").or(`stripe_subscription_id.eq.${change.subscription || "-"},stripe_customer_id.eq.${change.customer || "-"}`).limit(1);
    if (known.error || !known.data?.length) return { status: 200, body: { received: true, plan: "not-ours" } };
  }
  const { data, error } = await serviceClient().rpc("apply_plan_subscription", {
    p_event_id: event.id,
    p_type: type,
    p_event_at: new Date((event.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    p_user_id: change.userId || null,
    p_email: change.email || null,
    p_customer: change.customer || null,
    p_subscription: change.subscription || null,
    p_plan: change.plan || null,
    p_status: change.status || null,
    p_period_end: change.periodEnd,
    p_cancel_at_period_end: change.cancelAtPeriodEnd,
  });
  if (error) return { status: 500, body: { error: "Could not update the plan." } };
  return { status: 200, body: { received: true, plan: String(data || "") } };
}
