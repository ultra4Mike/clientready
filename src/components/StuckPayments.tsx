"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pending = { sessionId: string; docId: string | null; amount: number; paidAt: string; ref: string };

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : null;
}

async function fetchPending(): Promise<Pending[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  const response = await fetch("/api/pay/pending", { headers }).catch(() => null);
  const body = response?.ok ? ((await response.json().catch(() => ({}))) as { pending?: Pending[] }) : {};
  return Array.isArray(body.pending) ? body.pending : [];
}

/**
 * Notice for card payments Stripe confirmed but ClientReady could not record yet (invoice missing or
 * not synced). Shows nothing when there are none, when signed out, or before the migration runs.
 */
export default function StuckPayments() {
  const [items, setItems] = useState<Pending[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    fetchPending().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function retry(sessionId: string) {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy(sessionId);
    const response = await fetch("/api/pay/pending", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ sessionId }) }).catch(() => null);
    const body = (await response?.json().catch(() => ({}))) as { result?: string; error?: string } | undefined;
    setBusy("");
    if (body?.result === "recorded" || body?.result === "duplicate") setMessage("Payment recorded on the invoice. Reload to see it.");
    else if (body?.result === "pending") setMessage("The invoice still isn't in your account. Open it on the device where you made it so it syncs, then retry.");
    else setMessage(body?.error || "Could not retry right now.");
    setItems(await fetchPending());
  }

  if (!items.length) return message ? <p className="mb-4 text-sm text-[var(--cr-muted)]">{message}</p> : null;
  return (
    <div role="alert" data-testid="stuck-payments" className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold">Card payment{items.length === 1 ? "" : "s"} not recorded yet</p>
      <p className="mt-1 text-[var(--cr-muted)]">Stripe confirmed {items.length === 1 ? "this payment" : "these payments"}, but the invoice wasn&apos;t in your account. Make sure the invoice is synced, then tap Retry recording. It is never recorded twice.</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.sessionId} className="flex flex-wrap items-center justify-between gap-2">
            <span>${item.amount.toFixed(2)} · {new Date(item.paidAt).toLocaleDateString()} · <span className="text-[var(--cr-muted)]">{item.ref}</span></span>
            <button type="button" disabled={busy === item.sessionId} onClick={() => retry(item.sessionId)} className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! transition hover:bg-teal-400 disabled:opacity-60">
              {busy === item.sessionId ? "Retrying…" : "Retry recording"}
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="mt-2 text-[var(--cr-muted)]">{message}</p>}
    </div>
  );
}
