"use client";

import { useEffect, useState } from "react";

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
    fetch("/api/stripe/readiness", { cache: "no-store" })
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
          ["STRIPE_SECRET_KEY", state.secretKey, "Stripe secret key"],
          ["STRIPE_WEBHOOK_SECRET", state.webhookSecret, "Webhook signing secret"],
          ["SUPABASE_SERVICE_ROLE_KEY", state.serviceRoleKey, "Supabase service role key (server only)"],
          ["SUPABASE_URL", state.supabaseUrl, "Supabase project URL"],
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
      {rows.length > 0 && (
        <ul className="space-y-1 text-xs" data-testid="stripe-checks">
          {rows.map(([name, ok, label]) => (
            <li key={name} data-ok={ok}>
              <span aria-hidden>{ok ? "✓" : "○"}</span> {label} <code className="opacity-70">{name}</code> {ok ? "set" : "missing"}
            </li>
          ))}
        </ul>
      )}
      {status !== "ready" && (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--cr-muted)]" data-testid="stripe-steps">
          <li>In Supabase, run the migration <code>20261015030000_stripe_payments.sql</code> (SQL editor).</li>
          <li>Stripe Dashboard → Developers → API keys: copy the secret key (<code>sk_test_…</code> to try it, <code>sk_live_…</code> for real payments).</li>
          <li>Stripe Dashboard → Developers → Webhooks → Add endpoint with the URL below and the events <code>checkout.session.completed</code> and <code>checkout.session.async_payment_succeeded</code>. Copy its signing secret (<code>whsec_…</code>).</li>
          <li>On your host (e.g. Vercel → Settings → Environment Variables) set <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>, then redeploy. Never paste keys into this app.</li>
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Stripe webhook URL" readOnly value={webhookUrl} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded border border-teal-500/30 bg-transparent px-2 py-1 text-xs" />
        <button type="button" onClick={() => copy(webhookUrl, "Webhook URL")} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-xs font-medium transition hover:border-teal-500">Copy webhook URL</button>
      </div>
      {copied && <p className="text-xs text-[var(--cr-muted)]" data-testid="stripe-copied">{copied}</p>}
    </div>
  );
}
