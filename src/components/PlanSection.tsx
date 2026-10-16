"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTrialState, type TrialState } from "@/lib/trial";
import { isNativeApp } from "@/lib/native";
import { supabase } from "@/lib/supabase";

const PLAN_NAMES: Record<string, string> = { trial: "Free trial", active: "Paid plan", owner: "Owner (free)", monthly: "Monthly", quarterly: "3 months" };

/**
 * Owner Settings: current plan + trial status. "Upgrade plan" goes to /plans while Stripe subscriptions
 * are not set up, and straight to Stripe subscription checkout when they are. The native app shows the
 * plan name and status only (no button, price or link). Crew never reach this page (/profile is owner-only).
 */
export default function PlanSection() {
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [native, setNative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => { if (live) setNative(isNativeApp()); });
    getTrialState().then((state) => { if (live) setTrial(state); }).catch(() => {});
    if (!isNativeApp()) fetch("/api/stripe/subscribe", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (live) setCheckout(Boolean(data?.plans?.monthly)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!trial) return null;
  const paid = trial.plan === "active" || trial.plan === "owner" || trial.plan === "monthly" || trial.plan === "quarterly";
  const name = PLAN_NAMES[trial.plan] || trial.plan;
  const status = paid ? "Active" : trial.expired ? "Trial ended. Old documents stay viewable; new saves are locked." : `${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left in your free trial`;

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

  const button = "inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60";
  return (
    <section id="plan" className="scroll-mt-24 mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6" data-testid="settings-plan" data-plan={trial.plan} data-expired={trial.expired ? "1" : "0"}>
      <h2 className="text-lg font-bold tracking-tight">Plan</h2>
      <p className="mt-2 text-sm"><span className="text-[var(--cr-muted)]">Current plan: </span><span className="font-semibold" data-testid="plan-name">{name}</span></p>
      <p className={`mt-1 text-sm ${trial.expired && !paid ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`} data-testid="plan-status">{status}</p>
      {!native && !paid && (
        <div className="mt-3" data-purchase>
          {checkout
            ? <button type="button" className={button} data-testid="plan-upgrade" data-mode="checkout" disabled={busy} onClick={upgrade}>{busy ? "Opening checkout…" : "Upgrade plan"}</button>
            : <Link href="/plans" className={button} data-testid="plan-upgrade" data-mode="plans">Upgrade plan</Link>}
          {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300" data-testid="plan-upgrade-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
