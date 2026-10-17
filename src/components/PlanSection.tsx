"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTrialState, subscriptionUnlocks, type TrialState } from "@/lib/trial";
import { isNativeApp } from "@/lib/native";
import { supabase } from "@/lib/supabase";

const PLAN_NAMES: Record<string, string> = { trial: "Free trial", active: "Paid plan", owner: "Owner (free)", monthly: "Monthly", quarterly: "3 months" };

/**
 * Owner Settings: current plan + trial status. "Upgrade plan" goes to /plans while Stripe subscriptions
 * are not set up, and straight to Stripe subscription checkout when they are. The native app shows the
 * plan name and status only (no button, price or link). Crew never reach this page (/profile is owner-only).
 * Active subscribers (web only) get "Manage subscription": a Stripe customer portal session (card, switch, cancel).
 */
export default function PlanSection() {
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [portal, setPortal] = useState(false);
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => { if (live) setNative(isNativeApp()); });
    getTrialState().then((state) => { if (live) setTrial(state); }).catch(() => {});
    if (!isNativeApp()) fetch("/api/stripe/subscribe", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (live) { setCheckout(Boolean(data?.plans?.monthly)); setPortal(Boolean(data?.portal)); } }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!trial) return null;
  const subscribed = subscriptionUnlocks(trial.plan, trial.status || "", trial.periodEnd);
  const paid = trial.plan === "active" || trial.plan === "owner" || subscribed;
  const ended = !paid && (trial.plan === "monthly" || trial.plan === "quarterly");
  const name = PLAN_NAMES[trial.plan] || trial.plan;
  const until = trial.periodEnd ? new Date(trial.periodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  const status = subscribed && trial.status === "past_due" ? "Payment failed. Stripe will retry; update your card in Manage subscription."
    : subscribed && trial.cancelAtPeriodEnd ? `Canceled. Active until ${until || "the end of this period"}; it will not renew.`
    : subscribed && until ? `Active. Renews ${until}.`
    : paid ? "Active"
    : trial.expired ? `${ended ? "Subscription ended. " : ""}Trial ended. Old documents stay viewable; new saves are locked.`
    : `${ended ? "Subscription ended. " : ""}${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left in your free trial`;
  const manage = !native && portal && subscribed && Boolean(trial.billing);

  async function openPortal() {
    setBusy(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/stripe/portal", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token || ""}` } }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (result?.url) return void (window.location.href = result.url);
    setBusy(false);
    setError(result?.error || "Could not open subscription settings. Try again.");
  }

  async function upgrade() {
    setBusy(true);
    setError("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/stripe/subscribe", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ plan: "monthly" }) }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (result?.url) return void (window.location.href = result.url);
    setBusy(false);
    setError(result?.error || "Could not open checkout. Nothing was charged.");
  }

  const button = "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-teal-500 px-4 sm:w-auto font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60";
  return (
    <section id="plan" className="scroll-mt-24 mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6" data-testid="settings-plan" data-plan={trial.plan} data-expired={trial.expired ? "1" : "0"}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Plan</h2>
      <p className="mt-1 text-xl font-bold tracking-tight" data-testid="plan-name">{name}</p>
      <p className={`mt-2 inline-flex max-w-full items-start gap-1.5 rounded-2xl border px-2.5 py-1 text-xs font-semibold ${paid ? "cr-tone-teal border-teal-300 bg-teal-50 text-teal-800" : trial.expired ? "cr-tone-bad border-rose-300 bg-rose-50 text-rose-700" : "cr-tone-warn border-amber-300 bg-amber-50 text-amber-800"}`} data-testid="plan-status">{status}</p>
      {!native && !paid && (
        <div className="mt-4" data-purchase>
          {checkout
            ? <button type="button" className={button} data-testid="plan-upgrade" data-mode="checkout" disabled={busy} onClick={upgrade}>{busy ? "Opening checkout…" : "Upgrade plan"}</button>
            : <Link href="/plans" className={button} data-testid="plan-upgrade" data-mode="plans">Upgrade plan</Link>}
          {error && <p role="alert" className="cr-tone-bad mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="plan-upgrade-error">{error}</p>}
        </div>
      )}
      {manage && (
        <div className="mt-4" data-purchase>
          <button type="button" className={button} data-testid="plan-manage" disabled={busy} onClick={openPortal}>{busy ? "Opening…" : "Manage subscription"}</button>
          <p className="mt-2 text-xs text-[var(--cr-muted)]">Update your card, switch plans or cancel on Stripe&apos;s secure page.</p>
          {error && <p role="alert" className="cr-tone-bad mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700" data-testid="plan-manage-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
