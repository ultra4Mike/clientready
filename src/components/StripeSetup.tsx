"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Readiness = {
  secretKey: boolean;
  webhookSecret: boolean;
  serviceRoleKey: boolean;
  supabaseUrl: boolean;
  mode: "" | "test" | "live" | "unknown";
  currency: string;
  checkoutEnabled: boolean;
  webhookEnabled: boolean;
};

/** Owner help panel: is card payment (Stripe) set up on the server, and how to finish setup. Shows no secrets. */
export default function StripeSetup() {
  const [state, setState] = useState<Readiness | null | "error">(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/api/stripe/webhook`;
    // Readiness details need the owner's session (unauthenticated callers only get {enabled}).
    supabase.auth.getSession()
      .then(({ data }) => fetch("/api/stripe/readiness", { cache: "no-store", headers: data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {} }))
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Readiness) => setState(data))
      .catch(() => setState("error"))
      .finally(() => setWebhookUrl(url));
  }, []);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} copied`);
    } catch {
      setCopied("Select the text and copy it.");
    }
  }

  const ready = state && state !== "error" && state.checkoutEnabled && state.webhookEnabled;
  const status = state === null ? "checking" : state === "error" ? "unknown" : ready ? "ready" : state.checkoutEnabled ? "partial" : "off";
  const rows: [string, boolean, string][] =
    state && state !== "error"
      ? [
          ["secret", state.secretKey, "Stripe secret key"],
          ["webhook", state.webhookSecret, "Webhook signing secret"],
          ["service", state.serviceRoleKey, "Supabase service role key (server only)"],
          ["url", state.supabaseUrl, "Supabase project URL"],
        ]
      : [];

  return (
    <div className="space-y-3 rounded-lg border border-teal-500/20 p-3 text-sm" data-testid="stripe-setup" data-state={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Card payments (Stripe)</p>
        <span className="rounded-full border border-teal-500/30 px-2.5 py-0.5 text-xs font-medium" data-testid="stripe-status">
          {status === "checking" && "Checking…"}
          {status === "unknown" && "Could not check"}
          {status === "ready" && `Ready${state && state !== "error" && state.mode === "test" ? " · test mode" : state && state !== "error" && state.mode === "live" ? " · live" : ""}`}
          {status === "partial" && "Pay button on · payments not recorded yet"}
          {status === "off" && "Not set up"}
        </span>
      </div>
      <p className="text-xs text-[var(--cr-muted)]">
        {status === "ready"
          ? "Customers see “Pay by card” on shared invoices. Paid amounts are added to the invoice's payments; the status is never changed for you."
          : "Optional. When set up, customers can pay what they owe by card from a shared invoice or client portal. Nothing is needed from you now."}
      </p>
      <details className="group/dev rounded-lg border border-teal-500/15">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)] [&::-webkit-details-marker]:hidden">
          Developer setup<span aria-hidden="true" className="text-base transition group-open/dev:rotate-90">›</span>
        </summary>
        <div className="space-y-3 border-t border-teal-500/15 p-3 [&_code]:break-all">
      {rows.length > 0 && (
        <ul className="space-y-1 text-xs" data-testid="stripe-checks">
          {rows.map(([name, ok, label]) => (
            <li key={name} data-ok={ok}>
              <span aria-hidden>{ok ? "✓" : "○"}</span> {label} {ok ? "set" : "missing"}
            </li>
          ))}
        </ul>
      )}
      {status !== "ready" && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--cr-muted)]" data-testid="stripe-steps">
                    <li>Stripe Dashboard → Developers → API keys: copy the secret key (<code>sk_test_…</code> to try it, <code>sk_live_…</code> for real payments).</li>
          <li>Stripe Dashboard → Developers → Webhooks → Add endpoint with the URL below and the events <code>checkout.session.completed</code> and <code>checkout.session.async_payment_succeeded</code>. Copy its signing secret (<code>whsec_…</code>).</li>
          <li>Give the secret key and signing secret to whoever hosts your app (your developer or ClientReady support) so they can add them on the server and redeploy. Never paste keys into this app.</li>
        </ol>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input name="stripeWebhookUrl" aria-label="Stripe webhook URL" readOnly value={webhookUrl} onFocus={(event) => event.target.select()} className="w-full min-w-0 rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 font-mono text-xs sm:flex-1" />
        <button type="button" onClick={() => copy(webhookUrl, "Webhook URL")} className="min-h-11 rounded-lg border border-teal-500/30 px-3 py-2 text-sm font-medium transition hover:border-teal-500 sm:min-h-0 sm:shrink-0 sm:text-xs">Copy webhook URL</button>
      </div>
        </div>
      </details>
      {copied && <p className="text-xs text-[var(--cr-muted)]" data-testid="stripe-copied">{copied}</p>}
    </div>
  );
}
