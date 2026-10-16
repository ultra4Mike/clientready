"use client";

import { useEffect, useMemo, useState } from "react";
import LegalLinks from "@/components/LegalLinks";
import { approveByToken, fetchApprovalDoc, readApproval, type Approval } from "@/lib/approval";
import { amountOf, documentTotals, discountLabel } from "@/lib/discount";
import { balanceDue, paidTotal, readPayments } from "@/lib/payments";
import { readPhotos } from "@/lib/photos";
import { readSignature } from "@/lib/signature";
import { payUrlFor } from "@/lib/pay-link";
import { JobPhotoStrip } from "@/components/JobPhotos";
import { SignatureBlock } from "@/components/SignaturePad";
import LineSplit from "@/components/LineSplit";
import PayQr from "@/components/PayQr";
import SignaturePad from "@/components/SignaturePad";
import { fetchPortalDoc, portalApprove } from "@/lib/portal";
import { StageSchedule } from "@/components/StageSchedule";
import RatingBox from "@/components/Rating";
import { payNowAmount, readStages, todayYmd } from "@/lib/stages";
import type { Signature } from "@/lib/signature";

type LineItem = { description?: string; qty?: string; rate?: string; category?: string };
type PublicDoc = NonNullable<Awaited<ReturnType<typeof fetchApprovalDoc>>>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Public, no-login page behind an approval link (?t=) or a client portal link (?p=&d=).
 * Read-only, plus Approve (portal: with an optional drawn/typed signature) and card payment.
 */
export default function ApprovePage() {
  const [token, setToken] = useState("");
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [approval, setApproval] = useState<Approval | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [cardEnabled, setCardEnabled] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMessage, setPayMessage] = useState("");
  const [portal, setPortal] = useState<{ p: string; d: string } | null>(null);
  const [mySignature, setMySignature] = useState<Signature | null>(null);
  const [approvalSignature, setApprovalSignature] = useState<Signature | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const t = query.get("t") || "";
    const viaPortal = query.get("p") && query.get("d") ? { p: query.get("p") || "", d: query.get("d") || "" } : null;
    // Keep the token out of logs/analytics referrers on outbound links.
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    const justPaid = new URLSearchParams(window.location.search).get("paid") === "1";
    fetch("/api/pay/status")
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then((result: { enabled?: boolean }) => {
        setCardEnabled(Boolean(result.enabled));
        if (justPaid) setPayMessage("Thank you! Your card payment went through. It can take a minute to show here.");
      })
      .catch(() => setCardEnabled(false));
    (viaPortal ? fetchPortalDoc(viaPortal.p, viaPortal.d) : fetchApprovalDoc(t))
      .then((found) => {
        setToken(t);
        setPortal(viaPortal);
        if (!found) return setState("missing");
        setDoc(found);
        setApproval(readApproval(found.data?.approval));
        setApprovalSignature(readSignature((found.data?.approval as { signature?: unknown } | null)?.signature));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const data = useMemo(() => doc?.data || {}, [doc]);
  const items = useMemo(() => (Array.isArray(data.items) ? (data.items as LineItem[]) : []), [data]);
  const payments = useMemo(() => readPayments(data), [data]);
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
    const base = documentTotals(subtotal, text(data.taxPercent), text(data.discountType), text(data.discountValue));
    const paid = paidTotal(payments);
    return { ...base, paid, balance: balanceDue(base.total, paid, text(data.status)) };
  }, [items, payments, data]);

  async function payByCard(full = false) {
    setPaying(true);
    setPayMessage("");
    try {
      const response = await fetch("/api/pay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(portal ? { portal: portal.p, docId: portal.d } : { token }), full }) });
      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (response.ok && result.url && /^https?:\/\//.test(result.url)) {
        window.location.assign(result.url);
        return;
      }
      setPayMessage(result.error || "Card payment is not available right now.");
    } catch {
      setPayMessage("Card payment is not available right now.");
    }
    setPaying(false);
  }

  async function approve() {
    setBusy(true);
    setMessage("");
    try {
      const raw = portal ? await portalApprove(portal.p, portal.d, name || mySignature?.signerName || "", mySignature) : null;
      const result = portal ? readApproval(raw) : await approveByToken(token, name);
      if (result) {
        setApproval(result);
        if (raw) setApprovalSignature(readSignature(raw.signature));
      } else {
        // Already approved, or the link was turned off meanwhile: show what is stored now.
        const latest = portal ? await fetchPortalDoc(portal.p, portal.d) : await fetchApprovalDoc(token);
        if (!latest) setState("missing");
        else setApproval(readApproval(latest.data?.approval));
      }
    } catch {
      setMessage("Could not approve right now. Check your connection and try again.");
    }
    setBusy(false);
  }

  if (state !== "ready" || !doc) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center text-slate-700">
        {state === "loading" && <div aria-hidden="true" className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500 motion-reduce:animate-none" />}
        <h1 className="text-xl font-semibold" data-testid="approve-state">
          {state === "loading" ? "Loading…" : state === "missing" ? "This approval link is not valid" : "Could not load this document"}
        </h1>
        {state === "missing" && <p className="mt-2 text-sm">It may have been turned off or replaced. Ask the sender for a new link.</p>}
        {state === "error" && <p className="mt-2 text-sm">Check your connection and reload the page.</p>}
        <LegalLinks className="mt-8 text-center" />
      </main>
    );
  }

  const isProposal = doc.type === "proposal";
  const number = text(data.invoiceNumber) || doc.title;
  const changeOrderOf = data.changeOrderOf as { number?: string } | null | undefined;
  const payUrl = payUrlFor(data.payLink, doc.business.paymentLink);
  const signature = readSignature(data.signature);
  const proposalSignature = readSignature(data.proposalSignature);
  const approved = approval?.status === "approved";
  const stages = isProposal ? [] : readStages(data.stages);
  const payNow = payNowAmount(totals.total, totals.balance, stages, todayYmd());

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:px-4 sm:py-10">
      <section className="print-reset mx-auto max-w-3xl space-y-4">
        <div className="print-hide rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5" data-testid="approve-panel">
          {portal && <a href={`/portal?t=${encodeURIComponent(portal.p)}`} className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-teal-700 underline" data-testid="portal-back">← All my documents</a>}
          {portal && !approval && !isProposal ? null : approved ? (
            <p className="font-semibold text-emerald-700" data-testid="approve-done">
              Approved{approval?.approvedAt ? ` on ${new Date(approval.approvedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
              {approval?.approverName ? ` by ${approval.approverName}` : ""}. Thank you!
            </p>
          ) : (
            <div className="space-y-3">
            {portal && (
              <div data-testid="portal-sign">
                <p className="mb-1 font-medium text-slate-600">Sign (optional)</p>
                <SignaturePad value={mySignature} onChange={setMySignature} />
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 font-medium text-slate-600">
                Your name (optional)
                <input aria-label="Your name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm font-normal text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
              </label>
              <button type="button" disabled={busy} onClick={approve} className="min-h-11 w-full rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60 sm:w-auto">
                {busy ? "Approving…" : `Approve ${isProposal ? "proposal" : "invoice"}`}
              </button>
            </div>
            </div>
          )}
          {message && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
          <button type="button" onClick={() => window.print()} className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-slate-500 underline-offset-2 hover:text-teal-600 hover:underline">Print / Save PDF</button>
        </div>

        <div id="preview" className="rounded-2xl border border-slate-200 border-t-4 border-t-teal-500 bg-white p-5 shadow-sm sm:p-8 print:border-t print:border-t-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-sm text-slate-600">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL logo from the profile */}
              {doc.business.logo && <img src={doc.business.logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
              <p className="font-semibold">{doc.business.name}</p>
              <p>{[doc.business.email, doc.business.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right">
              {changeOrderOf?.number && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
              <p className="text-xs uppercase tracking-wide text-slate-500">{isProposal ? "Proposal" : "Invoice"}</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">{number}</h1>
              <p className="text-sm text-slate-600">Date: {text(data.invoiceDate) || "-"} · {isProposal ? "Valid until" : "Due"}: {text(data.dueDate) || "-"}</p>
              {changeOrderOf?.number && <p className="text-sm text-slate-600">Change order to {changeOrderOf.number}</p>}
            </div>
          </div>

          <div className="mt-6 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isProposal ? "Prepared for" : "Bill to"}</p>
            <p className="font-medium">{text(data.clientName) || doc.clientName}{text(data.clientCompany) && <span className="font-normal text-slate-600"> · {text(data.clientCompany)}</span>}</p>
            {text(data.clientAddress) && <p className="text-slate-600">{text(data.clientAddress)}</p>}
          </div>

          <div className="mt-6 divide-y divide-slate-100 border-t border-slate-200" data-testid="approve-items">
            {items.map((item, index) => (
              <div key={index} className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0 break-words">{item.description || "Item"} · {item.qty} x ${item.rate}</span>
                <span className="shrink-0 tabular-nums">${(amountOf(item.qty) * amountOf(item.rate)).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 grid gap-4 border-t border-slate-200 pt-3 text-sm sm:grid-cols-2 sm:gap-6">
            <div className="space-y-0.5 text-slate-600">
              <LineSplit items={items} />
              {payments.filter((payment) => amountOf(payment.amount) > 0).map((payment) => (
                <div key={payment.id} className="flex justify-between gap-2">
                  <span>Paid{payment.date ? ` ${payment.date}` : ""}{payment.method ? ` · ${payment.method}` : ""}</span>
                  <span>-${amountOf(payment.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
              {totals.discount > 0 && <div className="flex justify-between"><span>{discountLabel(text(data.discountType), text(data.discountValue))}</span><span>-${totals.discount.toFixed(2)}</span></div>}
              <div className="flex justify-between"><span>Tax</span><span>${totals.tax.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
              {totals.paid > 0 && <div className="flex justify-between"><span>Paid</span><span>-${totals.paid.toFixed(2)}</span></div>}
              {!isProposal && (
                <div className="mt-2 flex items-baseline justify-between cr-tone-teal rounded-lg bg-teal-50 px-3 py-2 text-lg font-bold text-teal-900 print:bg-transparent print:px-0" data-testid="approve-owed">
                  <span>Still owed</span><span>${totals.balance.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {!isProposal && (cardEnabled || payMessage) && (
            <div className="print-hide mt-4 cr-tone-teal rounded-xl border border-teal-500/30 bg-teal-50 p-4 text-sm text-slate-800" data-testid="card-pay">
              {cardEnabled && totals.balance >= 0.5 && (
                <button type="button" data-testid="pay-card" disabled={paying} onClick={() => payByCard(false)} className="min-h-12 w-full rounded-lg bg-teal-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-teal-500 disabled:opacity-60 sm:w-auto">
                  {paying ? "Opening secure checkout…" : `Pay $${payNow.toFixed(2)} by card${payNow < totals.balance ? " (due now)" : ""}`}
                </button>
              )}
              {cardEnabled && payNow < totals.balance && totals.balance >= 0.5 && (
                <button type="button" data-testid="pay-card-full" disabled={paying} onClick={() => payByCard(true)} className="mt-2 block text-sm font-medium text-teal-700 underline sm:ml-1 sm:inline-block sm:mt-0">
                  or pay the full balance ${totals.balance.toFixed(2)}
                </button>
              )}
              {payMessage && <p className="mt-2" data-testid="pay-message">{payMessage}</p>}
              {cardEnabled && totals.balance >= 0.5 && <p className="mt-2 text-xs text-slate-500">Secure checkout by Stripe. {payNow < totals.balance ? "You pay the amount due now; the rest follows the payment schedule." : "You pay what is still owed."}</p>}
            </div>
          )}
          {!isProposal && <StageSchedule stages={stages} total={totals.total} balance={totals.balance} />}
          {text(data.notes) && <p className="mt-3 text-sm text-slate-600">{text(data.notes)}</p>}
          {data.showPhotos === true && <JobPhotoStrip photos={readPhotos(data.photos)} />}
          {(payUrl || signature || proposalSignature) && (
            <div className="print-keep mt-4 grid items-end gap-6 border-t border-slate-200 pt-4 sm:grid-cols-2">
              <div className="space-y-3">
                <SignatureBlock signature={proposalSignature} label="Proposal accepted" />
                <SignatureBlock signature={signature} />
              </div>
              <div className="flex justify-end">{!isProposal && <PayQr url={payUrl} />}</div>
            </div>
          )}
          {approved && <p className="mt-3 text-sm font-semibold text-emerald-700">Approved{approval?.approverName ? ` by ${approval.approverName}` : ""}</p>}
          {approved && approvalSignature && <div className="mt-2" data-testid="approval-signature"><SignatureBlock signature={approvalSignature} label="Approved and signed" /></div>}
        </div>
        {!isProposal && (token || portal) && <RatingBox target={{ token, portal }} />}
      </section>
      <LegalLinks className="mt-8 text-center" />
    </main>
  );
}
