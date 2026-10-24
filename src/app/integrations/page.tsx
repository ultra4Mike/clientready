"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ApiSettings from "@/components/ApiSettings";
import { INTEGRATIONS } from "@/lib/flags";
import { PROVIDERS, PROVIDER_LABEL, type Provider } from "@/lib/integrations/providers";
import { supabase } from "@/lib/supabase";

type Connection = { provider: Provider; external_name: string; connected_at: string; last_sync_at: string | null; last_sync_result: { clients?: number; invoices?: number; payments?: number; skipped?: number; errors?: string[] } | null };

const NOTE: Record<string, string> = {
  connected: "Connected.", declined: "You cancelled the connection.", expired: "That connection link expired. Try again.",
  failed: "The connection didn't finish. Try again.", unavailable: "This connection isn't set up yet.",
};

/** Settings > Integrations: API keys plus QuickBooks Online / Xero (one-way, behind the flag). */
export default function IntegrationsPage() {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const status = await fetch("/api/integrations/status").then((r) => r.json()).catch(() => ({}));
    setReady((status?.providers as Record<string, boolean>) || {});
    const { data } = await supabase.from("integration_connections").select("provider,external_name,connected_at,last_sync_at,last_sync_result");
    setConnections((data as Connection[]) || []);
    const params = new URLSearchParams(window.location.search);
    for (const provider of PROVIDERS) { const value = params.get(provider); if (value && NOTE[value]) setMessage(`${PROVIDER_LABEL[provider]}: ${NOTE[value]}`); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function call(provider: Provider, action: "connect" | "sync" | "disconnect") {
    setBusy(`${provider}-${action}`); setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setBusy(""); setMessage("Sign in first."); return; }
    const response = await fetch(`/api/integrations/${provider}/${action}`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { url?: string; error?: string; result?: Connection["last_sync_result"] } | null;
    setBusy("");
    if (!response?.ok) { setMessage(json?.error || "That didn't work. Try again."); return; }
    if (action === "connect" && json?.url) { window.location.assign(json.url); return; }
    if (action === "sync" && json?.result) {
      const r = json.result;
      setMessage(`${PROVIDER_LABEL[provider]}: sent ${r.clients || 0} clients, ${r.invoices || 0} invoices, ${r.payments || 0} payments${r.errors?.length ? ` · problems: ${r.errors.join("; ")}` : ""}.`);
    }
    if (action === "disconnect") setMessage(`${PROVIDER_LABEL[provider]} disconnected.`);
    void load();
  }

  if (!INTEGRATIONS) return (
    <AppShell title="Integrations">
      <PageHeader title="Integrations" subtitle="Connect your own tools with the API." />
      <div className="space-y-4">
        <p className="text-sm" data-testid="integrations-off">QuickBooks and Xero connections aren&apos;t offered right now. To get your numbers to your accountant, use the accountant export on <a className="underline" href="/reports">Reports</a>. You can also connect Zapier, Make or your own tools with the API below.</p>
        <section className="space-y-2 rounded-2xl border border-teal-500/20 p-4" data-testid="integration-api"><h2 className="font-semibold">API (Zapier, Make, your own tools)</h2><ApiSettings /></section>
      </div>
    </AppShell>
  );
  return (
    <AppShell title="Integrations">
      <PageHeader title="Integrations" subtitle="Optional. Nothing is shared until you connect it." />
      <div className="space-y-4" data-testid="integrations-page">
        {message && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm" data-testid="integrations-message">{message}</p>}
        {PROVIDERS.map((provider) => {
          const connection = connections.find((item) => item.provider === provider);
          const r = connection?.last_sync_result;
          return (
            <section key={provider} className="space-y-2 rounded-2xl border border-teal-500/20 p-4" data-testid={`integration-${provider}`} data-connected={Boolean(connection)}>
              <h2 className="font-semibold">{PROVIDER_LABEL[provider]}</h2>
              <p className="text-sm text-[var(--cr-muted)]">Sends your clients, sent/paid invoices and payments to {PROVIDER_LABEL[provider]}. One way, and nothing is sent twice. Edits made later stay in ClientReady.</p>
              <p className="text-sm" data-testid={`integration-${provider}-status`}>
                {connection ? `Connected${connection.external_name ? ` to ${connection.external_name}` : ""}${connection.last_sync_at ? ` · last sent ${new Date(connection.last_sync_at).toLocaleString()}` : " · not sent yet"}` : ready[provider] ? "Not connected." : "Not set up on this app yet. Contact ClientReady support to turn it on."}
              </p>
              {r && <p className="text-xs text-[var(--cr-muted)]" data-testid={`integration-${provider}-result`}>Last run: {r.clients || 0} clients, {r.invoices || 0} invoices, {r.payments || 0} payments{r.errors?.length ? ` · ${r.errors.length} problem(s)` : ""}</p>}
              <div className="flex flex-wrap gap-2">
                {!connection && <button type="button" data-testid={`integration-${provider}-connect`} disabled={!ready[provider] || busy !== ""} onClick={() => void call(provider, "connect")} className="min-h-11 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Connect {PROVIDER_LABEL[provider]}</button>}
                {connection && <button type="button" data-testid={`integration-${provider}-sync`} disabled={busy !== ""} onClick={() => void call(provider, "sync")} className="min-h-11 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === `${provider}-sync` ? "Sending…" : "Send now"}</button>}
                {connection && <button type="button" data-testid={`integration-${provider}-disconnect`} disabled={busy !== ""} onClick={() => void call(provider, "disconnect")} className="min-h-11 rounded-lg border border-red-400 px-4 text-sm text-red-700 dark:text-red-300">Disconnect</button>}
              </div>
            </section>
          );
        })}
        <section className="space-y-2 rounded-2xl border border-teal-500/20 p-4" data-testid="integration-api">
          <h2 className="font-semibold">API (Zapier, Make, your own tools)</h2>
          <ApiSettings />
        </section>
      </div>
    </AppShell>
  );
}
