"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS, PRICES_ARE_PLACEHOLDERS } from "@/lib/plans";

/** Public plans page. Prices come from src/lib/plans.ts and are placeholders; there is no checkout yet. */
export default function PlansPage() {
  const [soon, setSoon] = useState("");
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14" data-testid="plans">
      <Link href="/dashboard" className="text-sm font-medium text-teal-600 underline dark:text-teal-300">← Back to ClientReady</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Plans</h1>
      <p className="mt-2 text-[var(--cr-muted)]">Pick what fits. Your old invoices and documents always stay viewable.</p>
      {PRICES_ARE_PLACEHOLDERS && <p className="mt-3 inline-block rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-sm font-medium" data-testid="plans-placeholder">Placeholder prices: not final. Paid plans are coming soon.</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div key={plan.id} data-testid={`plan-${plan.id}`} className={`flex flex-col rounded-2xl bg-[var(--cr-card)] p-6 shadow-sm ${plan.highlight ? "border-2 border-teal-400" : "border border-teal-500/20"}`}>
            <p className="text-sm font-semibold text-teal-600 dark:text-teal-300">{plan.name}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight" data-testid="plan-price">{plan.price}</p>
            <p className="text-sm text-[var(--cr-muted)]">{plan.period}{PRICES_ARE_PLACEHOLDERS && !plan.free ? " · placeholder" : ""}</p>
            <p className="mt-3 text-sm">{plan.blurb}</p>
            <ul className="mt-3 flex-1 list-disc space-y-1 pl-5 text-sm text-[var(--cr-muted)]">{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            {!plan.free && (
              <button type="button" data-testid={`subscribe-${plan.id}`} onClick={() => setSoon(plan.id)} className="mt-5 min-h-11 rounded-lg bg-teal-500 px-4 font-semibold text-slate-950 opacity-80">
                {soon === plan.id ? "Coming soon" : "Subscribe"}
              </button>
            )}
          </div>
        ))}
      </div>
      {soon && <p role="status" className="mt-4 text-sm" data-testid="plans-soon">Subscriptions are coming soon. Nothing was charged.</p>}
    </main>
  );
}
