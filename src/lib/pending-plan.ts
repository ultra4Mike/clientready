import { useSyncExternalStore } from "react";

/**
 * The plan a visitor picked before they had an account (home page / plans page). Carried through sign-up
 * and log-in as ?plan=, and kept on the device for a day so an email-confirmation round trip still lands
 * on checkout after they log in.
 */
const KEY = "clientready-pending-plan";
const DAY_MS = 24 * 60 * 60 * 1000;
export type PendingPlan = "monthly" | "quarterly";

export const asPlan = (value: unknown): PendingPlan | "" => (value === "monthly" || value === "quarterly" ? value : "");

export function planFromUrl(): PendingPlan | "" {
  if (typeof window === "undefined") return "";
  return asPlan(new URLSearchParams(window.location.search).get("plan"));
}

export function rememberPlan(plan: PendingPlan | "") {
  try {
    if (plan) localStorage.setItem(KEY, JSON.stringify({ plan, at: Date.now() }));
  } catch {}
}

export function pendingPlan(): PendingPlan | "" {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as { plan?: string; at?: number } | null;
    if (!saved || !saved.at || Date.now() - saved.at > DAY_MS) return "";
    return asPlan(saved.plan);
  } catch {
    return "";
  }
}

export function clearPendingPlan() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Where to go after sign-up / log-in: checkout for a chosen plan, else the dashboard. */
export function afterAuthPath(plan: PendingPlan | "") {
  return plan ? `/subscribe?plan=${plan}` : "/dashboard";
}

const noSubscribe = () => () => {};
/** ?plan= for client pages, hydration-safe (empty on the server render, the URL value after hydration). */
export function usePlanFromUrl(): PendingPlan | "" {
  return useSyncExternalStore(noSubscribe, planFromUrl, () => "");
}
