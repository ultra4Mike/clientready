"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTrialState } from "@/lib/trial";

/** Trial ended (or ending in 3 days or less): a banner linking to /plans. Uses the existing trial state; locks nothing itself.
 * R120: floats (fixed) so it never pushes the page down when it appears. */
export default function TrialBanner() {
  const [state, setState] = useState<{ expired: boolean; daysLeft: number; exempt?: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    // R118/R120: show the last known banner at once so the page doesn't jump ~57px when the trial check
    // finishes (that jump moved taps on a first-load invoice into the field above: Rate / Package name).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    try { const cached = JSON.parse(window.localStorage.getItem("cr-trial-banner") || "null"); if (cached) setState(cached); } catch { /* none */ }
    getTrialState().then((trial) => {
      if (!live) return;
      setState(trial);
      try { window.localStorage.setItem("cr-trial-banner", JSON.stringify({ expired: trial.expired, daysLeft: Number.isFinite(trial.daysLeft) ? trial.daysLeft : 9999, ...(trial.exempt ? { exempt: true } : {}) })); } catch { /* full */ }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!state || state.exempt || (!state.expired && !(Number.isFinite(state.daysLeft) && state.daysLeft <= 3))) return null;
  return (
    <div role="status" data-testid="trial-banner" data-expired={state.expired ? "1" : "0"} className="print-hide fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/60 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-lg dark:bg-[#2a2410] dark:text-amber-200 min-[900px]:inset-x-auto min-[900px]:bottom-4 min-[900px]:right-6 min-[900px]:w-[26rem]">
      <span>{state.expired ? "Your free trial has ended. Old documents stay viewable; new saves are locked." : `${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left in your free trial.`}</span>
      <Link href="/plans" data-purchase data-testid="trial-banner-plans" className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">See plans</Link>
    </div>
  );
}
