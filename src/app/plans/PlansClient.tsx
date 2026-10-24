"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NativeLoginOnly from "@/components/NativeLoginOnly";
import { supabase } from "@/lib/supabase";
import { PLANS, PRICES_ARE_PLACEHOLDERS } from "@/lib/plans";

/** Public plans page. Prices come from src/lib/plans.ts and are placeholders; there is no checkout yet. */
export function PlansClient() {
  const [soon, setSoon] = useState("");
  const [errorText, setErrorText] = useState("");
  // Subscription checkout only when the server has Stripe keys + price ids; otherwise the buttons start the free trial.
  const [live, setLive] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetch("/api/stripe/subscribe", { cache: "no-store" }).then((response) => response.json()).then((data) => setLive(data?.plans || {})).catch(() => setLive({}));
  }, []);
  async function subscribe(plan: string) {
    setSoon(plan);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return void (window.location.href = `/signup?plan=${plan}`);
    const response = await fetch("/api/stripe/subscribe", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ plan }) }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (result?.url) window.location.href = result.url;
    else { setSoon("error"); setErrorText(result?.error || ""); }
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14" data-testid="plans" data-purchase>
      <NativeLoginOnly />
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-teal-700 hover:underline dark:text-teal-300">← Back to ClientReady</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Plans</h1>
      <p className="mt-2 text-[var(--cr-muted)]">Pick what fits. Your old invoices and documents always stay viewable.</p>
      {PRICES_ARE_PLACEHOLDERS && <p className="mt-3 inline-block rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-medium" data-testid="plans-placeholder">Placeholder prices: not final. Paid plans are coming soon.</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-3 md:items-stretch">
        {PLANS.map((plan) => (
          <div key={plan.id} data-testid={`plan-${plan.id}`} className={`relative flex flex-col rounded-2xl bg-[var(--cr-card)] p-6 ${plan.highlight ? "border-2 border-teal-400 shadow-xl shadow-teal-500/10 md:-my-2 md:py-8" : "border border-teal-500/20 shadow-sm"}`}>
            {plan.highlight && <span aria-hidden="true" className="absolute -top-3 left-6 rounded-full bg-teal-500 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-950!">Recommended</span>}
            <p className="text-sm font-semibold text-teal-600 dark:text-teal-300">{plan.name}</p>
            <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums" data-testid="plan-price">{plan.price}</p>
            <p className="text-sm text-[var(--cr-muted)]">{plan.period}{PRICES_ARE_PLACEHOLDERS && !plan.free ? " · placeholder" : ""}</p>
            <p className="mt-3 text-sm">{plan.blurb}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-[var(--cr-muted)]">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="font-bold text-teal-600 dark:text-teal-300">✓</span><span>{feature}</span></li>)}</ul>
            {!plan.free && (live[plan.id]
              ? <button type="button" data-testid={`subscribe-${plan.id}`} data-mode="checkout" disabled={soon === plan.id} onClick={() => subscribe(plan.id)} className="mt-6 min-h-11 rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60">
                  {soon === plan.id ? "Opening checkout…" : "Subscribe"}
                </button>
              : <Link href="/signup" data-testid={`subscribe-${plan.id}`} data-mode="trial" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">
                  Start free trial
                </Link>
            )}
          </div>
        ))}
      </div>
      {soon === "error" && <p role="status" className="mt-6 rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3 text-sm" data-testid="plans-soon">{errorText || "Could not open checkout. Nothing was charged."}</p>}
    </main>
  );
}
