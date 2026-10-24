"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { isStripeCardPayment, paymentMethods, readPayments, refundableFor, type Payment } from "@/lib/payments";

const DOCS_KEY = "clientready-documents";

/**
 * R2: owner-only refund of one saved payment (partial allowed). Card payments taken through ClientReady can go
 * back to the card through Stripe; anything else is recorded as a manual refund. Nothing happens until the owner
 * confirms. The saved invoice (payments + history) comes back from the server and replaces the local copy.
 */
export function RefundPayment({ docId, payment, payments, onDone }: { docId: string; payment: Payment; payments: Payment[]; onDone: (payments: Payment[], message: string) => void }) {
  const left = refundableFor(payments, payment.id);
  const card = isStripeCardPayment(payment);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [via, setVia] = useState<"stripe" | "manual">(card ? "stripe" : "manual");
  const [method, setMethod] = useState(payment.method && paymentMethods.includes(payment.method) && payment.method !== "Card (Stripe)" ? payment.method : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  if (!/^[0-9a-f-]{36}$/i.test(docId) || left <= 0) return null;

  const start = () => { setOpen(true); setAmount(left.toFixed(2)); setError(""); setRequestId(crypto.randomUUID()); };
  const submit = async () => {
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!(value > 0) || value > left + 0.004) { setError(`Enter an amount up to $${left.toFixed(2)}.`); return; }
    if (via === "manual" && !method) { setError("Choose how the money was given back."); return; }
    const words = via === "stripe" ? `Refund $${value.toFixed(2)} to the client's card through Stripe?` : `Record a $${value.toFixed(2)} refund (${method})? This doesn't move any money.`;
    if (!window.confirm(words)) return;
    setBusy(true); setError("");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/pay/refund", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` },
      body: JSON.stringify({ docId, paymentId: payment.id, amount: value.toFixed(2), requestId, via, method, note }),
    }).catch(() => null);
    const out = (response ? await response.json().catch(() => ({})) : {}) as { error?: string; result?: string; message?: string; data?: Record<string, unknown> };
    setBusy(false);
    if (!response?.ok) { setError(out.error || "Could not reach your account. Nothing was changed."); return; }
    if (out.result === "pending") { setOpen(false); onDone(payments, out.message || "Refund sent to Stripe."); return; }
    if (out.data) {
      const docs = JSON.parse(window.localStorage.getItem(DOCS_KEY) || "[]") as { id: string; data?: Record<string, unknown> }[];
      window.localStorage.setItem(DOCS_KEY, JSON.stringify(docs.map((item) => (item.id === docId ? { ...item, data: out.data } : item))));
    }
    setOpen(false);
    onDone(out.data ? readPayments(out.data as never) : payments, `Refunded $${value.toFixed(2)}. It's in the invoice history.`);
  };

  if (!open) return <button type="button" data-testid="refund-open" onClick={start} className="min-h-11 justify-self-start rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-500/10 dark:text-slate-200">Refund…</button>;
  return (
    <div data-testid="refund-form" className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm sm:col-span-2">
      <p className="font-medium">Refund this payment (up to ${left.toFixed(2)})</p>
      {card && (
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5"><input type="radio" name={`via-${payment.id}`} checked={via === "stripe"} onChange={() => setVia("stripe")} /> Back to the card (Stripe)</label>
          <label className="flex items-center gap-1.5"><input type="radio" name={`via-${payment.id}`} checked={via === "manual"} onChange={() => setVia("manual")} /> Record only (refunded another way)</label>
        </div>
      )}
      <label className="font-medium text-slate-600">Amount<input data-testid="refund-amount" inputMode="decimal" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      {via === "manual" && (
        <label className="font-medium text-slate-600">Given back by<select data-testid="refund-method" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" value={method} onChange={(event) => setMethod(event.target.value)}><option value="">Choose…</option>{paymentMethods.filter((item) => item !== "Card (Stripe)").map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      )}
      <label className="font-medium text-slate-600">Note (optional, owner only)<input data-testid="refund-note" maxLength={300} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" data-testid="refund-submit" disabled={busy} onClick={submit} className="min-h-11 rounded-lg bg-amber-600 px-3 font-medium text-white disabled:opacity-60">{busy ? "Refunding…" : "Refund"}</button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg px-3 font-medium">Cancel</button>
      </div>
    </div>
  );
}
