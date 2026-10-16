"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getTrialState } from "@/lib/trial";

/** Trial ended (or ending in 3 days or less): a banner linking to /plans. Uses the existing trial state; locks nothing itself. */
export default function TrialBanner() {
  const [state, setState] = useState<{ expired: boolean; daysLeft: number } | null>(null);
  useEffect(() => {
    let live = true;
    getTrialState().then((trial) => { if (live) setState(trial); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!state || (!state.expired && !(Number.isFinite(state.daysLeft) && state.daysLeft <= 3))) return null;
  return (
    <div role="status" data-testid="trial-banner" data-expired={state.expired ? "1" : "0"} className="print-hide mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
      <span>{state.expired ? "Your free trial has ended. Old documents stay viewable; new saves are locked." : `${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left in your free trial.`}</span>
      <Link href="/plans" data-testid="trial-banner-plans" className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-3 font-semibold text-slate-950">See plans</Link>
    </div>
  );
}
