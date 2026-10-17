"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isNativeApp } from "@/lib/native";
import { clearPendingPlan, pendingPlan, planFromUrl, rememberPlan } from "@/lib/pending-plan";

/**
 * After sign-up / log-in with a chosen plan: opens Stripe subscription checkout for the signed-in owner.
 * No session -> log in (plan carried). Native app -> dashboard (no purchases in the app).
 */
export default function SubscribePage() {
  const [state, setState] = useState<{ kind: "busy" | "error" | "manage"; text: string }>({ kind: "busy", text: "Opening secure checkout…" });
  useEffect(() => {
    let live = true;
    (async () => {
      if (isNativeApp()) return void (window.location.href = "/dashboard");
      const plan = planFromUrl() || pendingPlan();
      if (!plan) return void (window.location.href = "/plans");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        rememberPlan(plan);
        return void (window.location.href = `/login?plan=${plan}`);
      }
      const response = await fetch("/api/stripe/subscribe", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ plan }) }).catch(() => null);
      const result = (await response?.json().catch(() => null)) as { url?: string; error?: string; manage?: boolean } | null;
      clearPendingPlan();
      if (result?.url) return void (window.location.href = result.url);
      if (live) setState({ kind: result?.manage ? "manage" : "error", text: result?.error || "Could not open checkout. Nothing was charged." });
    })();
    return () => { live = false; };
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4 py-10" data-testid="subscribe" data-state={state.kind} data-purchase>
      <div className="w-full max-w-md rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 text-center shadow-xl shadow-teal-950/10 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{state.kind === "busy" ? "Almost there" : "Checkout"}</h1>
        <p className="mt-3 text-sm text-[var(--cr-muted)]" role={state.kind === "busy" ? "status" : "alert"} data-testid="subscribe-message">{state.text}</p>
        {state.kind !== "busy" && (
          <div className="mt-6 flex flex-col gap-2">
            <Link href={state.kind === "manage" ? "/profile#plan" : "/plans"} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">{state.kind === "manage" ? "Go to Settings › Plan" : "Back to plans"}</Link>
            <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-[var(--cr-muted)] hover:text-teal-600">Go to dashboard</Link>
          </div>
        )}
      </div>
    </main>
  );
}
