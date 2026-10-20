"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PAYMENT_METHODS_KEY, PROVIDERS, readLocalPaymentMethods, readPaymentMethods, type MethodConfig, type PaymentMethodsConfig, type ProviderId } from "@/lib/payments/providers";

const input = "mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base outline-none sm:text-sm min-h-11 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

/** Settings: which payment methods customers see, with the owner's handles. Saved to profiles.payment_methods (migration 20261016070000). */
export default function PaymentMethodsSettings() {
  const [config, setConfig] = useState<PaymentMethodsConfig>({});
  const [message, setMessage] = useState("");
  const [cardLive, setCardLive] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/pay/status").then((res) => res.json()).then((body) => setCardLive(Boolean(body?.enabled))).catch(() => setCardLive(false));
  }, []);
  useEffect(() => {
    Promise.resolve().then(() => setConfig(readLocalPaymentMethods()));
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: row } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      if (row && "payment_methods" in row) {
        const cloud = readPaymentMethods(row.payment_methods);
        window.localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(cloud));
        setConfig(cloud);
      }
    })().catch(() => {});
  }, []);
  const set = (id: ProviderId, patch: MethodConfig) => { setConfig((current) => ({ ...current, [id]: { ...current[id], ...patch } })); setMessage(""); };

  async function save() {
    const clean = readPaymentMethods(config);
    window.localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(clean));
    setConfig(clean);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setMessage("Saved on this device. Log in to show them on your customer links.");
    const { error } = await supabase.from("profiles").update({ payment_methods: clean }).eq("id", data.user.id);
    setMessage(error ? "Saved on this device. Customer links show them after your account is updated." : "Payment methods saved.");
  }

  return (
    <section id="payment-methods" className="scroll-mt-24 mt-6 space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6" data-testid="payment-methods-settings">
      <div>
        <h2 className="text-lg font-semibold">Payment methods</h2>
        <p className="text-sm text-[var(--cr-muted)]">Shown on your invoices, approval links and client portal with copy buttons. You still mark invoices paid yourself.</p>
      </div>
      {PROVIDERS.map((provider) => {
        const cfg = config[provider.id] || {};
        return (
          <div key={provider.id} className={`rounded-xl border p-3 transition sm:p-4 ${cfg.enabled ? "border-teal-500/50 bg-teal-500/5" : "border-slate-200"}`} data-testid={`pm-${provider.id}`}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
              <input className="h-5 w-5 shrink-0 accent-teal-500" type="checkbox" name={`pm-${provider.id}-enabled`} data-testid={`pm-enable-${provider.id}`} checked={Boolean(cfg.enabled)} onChange={(event) => set(provider.id, { enabled: event.target.checked })} />
              {provider.label}
            </label>
            {cfg.enabled && provider.fields.map((field) => (
              <label key={field.key} className="mt-2 block text-sm">{field.label}
                {field.multiline
                  ? <textarea name={`pm-${provider.id}-${field.key}`} rows={2} className={input} placeholder={field.placeholder} value={cfg[field.key] as string || ""} onChange={(event) => set(provider.id, { [field.key]: event.target.value })} />
                  : <input name={`pm-${provider.id}-${field.key}`} className={input} placeholder={field.placeholder} value={cfg[field.key] as string || ""} onChange={(event) => set(provider.id, { [field.key]: event.target.value })} />}
              </label>
            ))}
            {provider.kind === "hosted" && (
              <p className="mt-1 text-xs" data-testid="pm-stripe-status" data-live={cardLive ? "true" : "false"}>
                {cardLive === null ? "Checking card payments…" : cardLive ? <span className="font-semibold text-emerald-700 dark:text-emerald-300">Online card payments: on. Customers see a Pay by card button.</span> : <span className="text-[var(--cr-muted)]">Online card payments aren&apos;t set up yet, so customers won&apos;t see a card button.</span>}
              </p>
            )}
            {cfg.enabled && !provider.ready(cfg) && <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">Add the details above or customers won&apos;t see this one.</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="pm-save" onClick={save} className="min-h-11 rounded-lg bg-teal-500 px-5 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Save payment methods</button>
        {message && <p role="status" className="text-sm" data-testid="pm-message">{message}</p>}
      </div>
    </section>
  );
}
