"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LegalLinks from "@/components/LegalLinks";
import { approveByTokenSigned, fetchApprovalDoc, fetchVisitByToken, readApproval, type Approval, type PublicVisit } from "@/lib/approval";
import { amountOf, documentTotals, discountLabel } from "@/lib/discount";
import { grossPaid, isRefundRow, owedAfterRefunds, paidTotal, readPayments, refundedTotal, refundWording } from "@/lib/payments";
import { readPhotos } from "@/lib/photos";
import { readSignature } from "@/lib/signature";
import { payUrlFor } from "@/lib/pay-link";
import { JobPhotoStrip } from "@/components/JobPhotos";
import { SignatureBlock } from "@/components/SignaturePad";
import LineSplit from "@/components/LineSplit";
import PayQr from "@/components/PayQr";
import SignaturePad from "@/components/SignaturePad";
import { fetchPortal, fetchPortalDoc, portalApprove, portalDocUrl, type PortalDoc } from "@/lib/portal";
import { linkByNumber } from "@/lib/doc-trail";
import { StageSchedule, niceDate } from "@/components/StageSchedule";
import RatingBox from "@/components/Rating";
import PayOptions from "@/components/PayOptions";
import { fetchPublicPaymentMethods } from "@/lib/payments/public";
import type { PaymentMethodsConfig } from "@/lib/payments/providers";
import { payNowAmount, readStages, todayYmd } from "@/lib/stages";
import type { Signature } from "@/lib/signature";
import DocTrail from "@/components/DocTrail";

type LineItem = { description?: string; qty?: string; rate?: string; category?: string };
type PublicDoc = NonNullable<Awaited<ReturnType<typeof fetchApprovalDoc>>>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Public, no-login page behind an approval link (?t=) or a client portal link (?p=&d=).
 * Read-only, plus Approve (portal: with an optional drawn/typed signature) and card payment.
 */
/** R52: "14:30" -> "2:30 PM" on customer links. */
function time12(value: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

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
  const [portalDocs, setPortalDocs] = useState<PortalDoc[]>([]);
  const [mySignature, setMySignature] = useState<Signature | null>(null);
  const [approvalSignature, setApprovalSignature] = useState<Signature | null>(null);
  const [payMethods, setPayMethods] = useState<PaymentMethodsConfig>({});
  const [visit, setVisit] = useState<PublicVisit | null>(null);
  // R128: the invoice made automatically when a proposal is approved (its own customer link).
  const [invoiceLink, setInvoiceLink] = useState<{ href: string; number: string } | null>(null);
  const convertRun = useRef<Promise<{ target: Record<string, string>; href: string; number: string } | null> | null>(null);
  // R128: after Stripe sends the client back: confirming, then a receipt with a number.
  const [receiptState, setReceiptState] = useState<"" | "confirming" | "done" | "slow">("");
  const [receiptId, setReceiptId] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const t = query.get("t") || "";
    const viaPortal = query.get("p") && query.get("d") ? { p: query.get("p") || "", d: query.get("d") || "" } : null;
    if (t && !viaPortal) fetchVisitByToken(t).then(setVisit).catch(() => {});
    if (viaPortal || t) fetchPublicPaymentMethods(viaPortal ? { portal: viaPortal.p } : { token: t }).then(setPayMethods).catch(() => {});
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
        if (justPaid) setReceiptState("confirming");
      })
      .catch(() => setCardEnabled(false));
    (viaPortal ? fetchPortalDoc(viaPortal.p, viaPortal.d) : fetchApprovalDoc(t))
      .then((found) => {
        setToken(t);
        setPortal(viaPortal);
        if (viaPortal) fetchPortal(viaPortal.p).then((all) => setPortalDocs(linkByNumber(all?.documents || []))).catch(() => setPortalDocs([]));
        if (!found) return setState("missing");
        setDoc(found);
        setApproval(readApproval(found.data?.approval));
        setApprovalSignature(readSignature((found.data?.approval as { signature?: unknown } | null)?.signature));
        setState("ready");
      })
      .catch(() => setState("error"));
    const cs = query.get("cs") || "";
    if (justPaid && /^cs_/.test(cs)) {
      // R128: confirm the Stripe session now (records it once, same as the webhook), then reload the doc
      // until the payment row is there and show the receipt. Never "it can take a minute" with nothing else.
      const target = viaPortal ? { portal: viaPortal.p, docId: viaPortal.d } : { token: t };
      const load = () => (viaPortal ? fetchPortalDoc(viaPortal.p, viaPortal.d) : fetchApprovalDoc(t));
      (async () => {
        for (let i = 0; i < 12; i++) {
          const result = await fetch("/api/pay/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, cs }) }).then((r) => r.json()).catch(() => ({})) as { paid?: boolean; paymentId?: string };
          const fresh = await load().catch(() => null);
          const id = `stripe_${cs}`;
          if (fresh && readPayments(fresh.data || {}).some((row) => row.id === id)) {
            setDoc(fresh);
            setReceiptId(id);
            setReceiptState("done");
            window.history.replaceState(null, "", window.location.pathname + (viaPortal ? `?p=${encodeURIComponent(viaPortal.p)}&d=${encodeURIComponent(viaPortal.d)}` : `?t=${encodeURIComponent(t)}`) + `#receipt-${encodeURIComponent(id)}`);
            return;
          }
          if (result.paid === false && i > 2) break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        setReceiptState("slow");
      })();
    }
  }, []);

  const data = useMemo(() => doc?.data || {}, [doc]);
  const items = useMemo(() => (Array.isArray(data.items) ? (data.items as LineItem[]) : []), [data]);
  const payments = useMemo(() => readPayments(data), [data]);
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
    const base = documentTotals(subtotal, text(data.taxPercent), text(data.discountType), text(data.discountValue));
    const paid = paidTotal(payments);
    // R128: refund-aware (a refund never reopens a balance or asks the client to pay it again).
    return { ...base, paid, gross: grossPaid(payments), refunded: refundedTotal(payments), balance: owedAfterRefunds(base.total, payments, data.status, data.rebillRefund) };
  }, [items, payments, data]);

  async function payByCard(full = false, target?: Record<string, string>) {
    setPaying(true);
    setPayMessage("");
    try {
      const response = await fetch("/api/pay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(target || (portal ? { portal: portal.p, docId: portal.d } : { token })), full }) });
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

  /** R128: an approved proposal becomes an invoice on the server (once). Returns the invoice's own link. */
  // One convert request at a time on this page (the Approve button and the page effect both ask);
  // the server also allows only one invoice per proposal (unique index), so a double tap or a
  // second tab gets the same invoice back.
  function convertToInvoice(): Promise<{ target: Record<string, string>; href: string; number: string } | null> {
    if (!convertRun.current) convertRun.current = convertOnce().then((link) => { if (!link) convertRun.current = null; return link; });
    return convertRun.current;
  }
  async function convertOnce(): Promise<{ target: Record<string, string>; href: string; number: string } | null> {
    const response = await fetch("/api/approve/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(portal ? { portal: portal.p, docId: portal.d } : { token }) }).catch(() => null);
    const result = (await response?.json().catch(() => ({}))) as { invoiceId?: string; token?: string; number?: string } | undefined;
    if (!response?.ok || !result?.invoiceId) return null;
    const target: Record<string, string> = portal ? { portal: portal.p, docId: result.invoiceId } : { token: String(result.token || "") };
    const href = portal ? `/approve?p=${encodeURIComponent(portal.p)}&d=${encodeURIComponent(result.invoiceId)}` : `/approve?t=${encodeURIComponent(String(result.token || ""))}`;
    const link = { target, href, number: String(result.number || "") };
    setInvoiceLink({ href, number: link.number });
    return link;
  }

  async function approve(thenPay = false) {
    setBusy(true);
    setMessage("");
    try {
      const who = name.trim() || mySignature?.signerName || "";
      // R128: a typed name counts as the typed signature (no need to open the Type tab first).
      const sig: Signature | null = mySignature ? { ...mySignature, signerName: mySignature.signerName || who } : who ? { type: "typed", text: who, signerName: who, signedAt: new Date().toISOString() } : null;
      const raw = portal ? await portalApprove(portal.p, portal.d, who, sig) : null;
      let result = portal ? readApproval(raw) : null;
      let signedRaw: Record<string, unknown> | null = null;
      if (!portal) ({ approval: result, raw: signedRaw } = await approveByTokenSigned(token, who, sig));
      if (!result) {
        // Already approved, or the link was turned off meanwhile: show what is stored now.
        const latest = portal ? await fetchPortalDoc(portal.p, portal.d) : await fetchApprovalDoc(token);
        if (!latest) setState("missing");
        else result = readApproval(latest.data?.approval);
      }
      if (result) {
        setApproval(result);
        if (raw || signedRaw) setApprovalSignature(readSignature((raw || signedRaw)?.signature));
        if (result.status === "approved" && doc?.type === "proposal") {
          const link = await convertToInvoice();
          if (thenPay && link) { setBusy(false); return payByCard(false, link.target); }
          if (thenPay && !link) setMessage("Approved. The deposit can't be paid online right now; your contractor will follow up.");
        }
      }
    } catch {
      setMessage("Could not approve right now. Check your connection and try again.");
    }
    setBusy(false);
  }

  // R128: an approved proposal always leads to its invoice (also when the page is opened again later).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async server call, sets state when it answers
    if (doc?.type === "proposal" && approval?.status === "approved" && !invoiceLink) void convertToInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per approved proposal
  }, [doc?.type, approval?.status]);

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
  // R128: only proposals (and change orders sent for approval) need the client's approval. A plain
  // invoice is payable right away, whatever an old link's approval block says.
  const needsApproval = isProposal || (Boolean(changeOrderOf?.number) && Boolean(approval));
  const today = todayYmd();
  const jobDone = visit?.status === "done" && Boolean(visit.date) && visit.date <= today;
  const stages = isProposal ? [] : readStages(data.stages);
  const payNow = payNowAmount(totals.total, totals.balance, stages, today, false, { jobDone });
  const awaitingApproval = false;
  const canCard = cardEnabled && totals.balance >= 0.5;
  const paidInFull = !isProposal && totals.total > 0 && totals.balance <= 0.004 && (totals.gross > 0.004 || text(data.status) === "paid");
  const depositPercent = Number(text(data.depositPercent)) > 0 && Number(text(data.depositPercent)) < 100 ? Number(text(data.depositPercent)) : 0;
  const depositAmount = Math.round(totals.total * depositPercent) / 100;
  const docDate = text(data.invoiceDate) || text(data.date);
  const dueText = isProposal ? (text(data.dueDate) ? niceDate(text(data.dueDate)) : "-") : text(data.dueDate) ? niceDate(text(data.dueDate)) : data.dueOnCompletion ? "When the job is done" : "Due on receipt";
  const refundRows = payments.filter((payment) => isRefundRow(payment) && amountOf(String(payment.amount).replace("-", "")) > 0);
  const receipt = receiptId ? payments.find((payment) => payment.id === receiptId) || null : null;
  const receiptNumber = (id: string) => `R-${number.replace(/[^A-Za-z0-9]/g, "")}-${(id.replace(/[^A-Za-z0-9]/g, "").slice(-6) || "1").toUpperCase()}`;
  const refundText = isProposal ? "" : refundWording(totals.total, payments);
  const baseLabel = !isProposal && paidInFull ? "Paid" : approved ? "Approved" : needsApproval && approval ? "Awaiting approval" : isProposal ? "" : totals.paid > 0.004 ? "Partially paid" : "Due";
  // Same refund words as the owner's Documents list (lib/payments refundWording).
  const statusLabel = refundText ? (paidInFull ? refundText : `${baseLabel} · ${refundText}`) : baseLabel;
  // The rating comes after the work: once the invoice is paid or the visit is done.
  const showRating = !isProposal && (token || portal) && (paidInFull || jobDone);
  const visitLabel = visit?.status === "done" && visit.date <= today ? "Visit done" : visit && visit.date < today ? "Visit" : "Your visit";

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-900 sm:px-4 sm:py-10">
      <section className="print-reset mx-auto max-w-3xl space-y-4">
        {portal && <a href={`/portal?t=${encodeURIComponent(portal.p)}`} className="print-hide inline-flex min-h-11 items-center text-sm font-medium text-teal-700 underline" data-testid="portal-back">← All my documents</a>}
        {portal && <DocTrail docs={portalDocs} currentId={portal.d} hrefFor={(d) => portalDocUrl(portal.p, d.id)} light />}
        {receiptState === "confirming" && <p className="print-hide rounded-xl border border-teal-500/30 bg-teal-50 p-4 text-sm font-medium text-teal-900" data-testid="pay-confirming" role="status">Thank you! Confirming your payment with Stripe…</p>}
        {receiptState === "slow" && <p className="print-hide rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="pay-message" role="status">Thank you! Stripe has your payment. Your receipt will appear on this page shortly; reload in a minute.</p>}
        {receipt && (
          <div id={`receipt-${receipt.id}`} className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900 shadow-sm" data-testid="pay-receipt">
            <p className="text-xs font-semibold uppercase tracking-wide">Payment receipt</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">${amountOf(receipt.amount).toFixed(2)} paid</p>
            <p className="mt-1">Receipt <span className="font-semibold" data-testid="receipt-number">{receiptNumber(receipt.id)}</span> · {number} · {receipt.date ? niceDate(receipt.date) : ""} · Card</p>
            <p className="mt-1">{totals.balance > 0.004 ? `Remaining balance: $${totals.balance.toFixed(2)}` : "Paid in full. Thank you!"}</p>
            <div className="print-hide mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg bg-emerald-700 px-4 font-semibold text-white">Print / save receipt</button>
              <a href={`#receipt-${receipt.id}`} data-testid="receipt-link" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-400 px-4 font-medium">Link to this receipt</a>
            </div>
          </div>
        )}
        <div id="preview" className="rounded-2xl border border-slate-200 border-t-4 border-t-teal-500 bg-white p-5 shadow-sm sm:p-8 print:border-t print:border-t-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-sm text-slate-600">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL logo from the profile */}
              {doc.business.logo && <img src={doc.business.logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
              <p className="text-lg font-bold leading-tight text-slate-900">{doc.business.name}</p>
              <p className="mt-0.5 break-words">{[doc.business.email, doc.business.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right">
              {changeOrderOf?.number && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
              <p className="text-xs uppercase tracking-wide text-slate-500">{isProposal ? "Proposal" : "Invoice"}{(() => {
                const label = statusLabel;
                const good = label === "Approved" || label.startsWith("Paid");
                return label ? <> · <span data-testid="approve-status-pill" className={`rounded-full px-2 py-0.5 font-semibold ${good ? "cr-tone-good bg-emerald-100 text-emerald-800" : "cr-tone-warn bg-amber-100 text-amber-800"}`}>{label}</span></> : null;
              })()}</p>
              <h1 className="text-2xl font-bold leading-tight tracking-tight">{number}</h1>
              <p className="text-sm text-slate-600" data-testid="approve-dates">Date: {docDate ? niceDate(docDate) : "-"} · {isProposal ? "Valid until" : "Due"}: {dueText}</p>
              {changeOrderOf?.number && <p className="text-sm text-slate-600">Change order to {changeOrderOf.number}</p>}
            </div>
          </div>

          <div data-testid="approve-bill-to" className="cr-bill-to mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isProposal ? "Prepared for" : "Bill to"}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{text(data.clientName) || doc.clientName}{text(data.clientCompany) && <span className="font-normal text-slate-600"> · {text(data.clientCompany)}</span>}</p>
            {text(data.clientAddress) && <p className="mt-0.5 text-slate-700">{text(data.clientAddress)}</p>}
          </div>

          {visit && visit.date && (
            <p data-testid="link-visit" data-status={visit.status} className="cr-tone-teal mt-4 rounded-xl border border-teal-500/30 bg-teal-50 px-4 py-3 text-sm text-slate-800">
              <span className="font-semibold">{visitLabel}:</span> {new Date(`${visit.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{visit.startTime ? ` · ${time12(visit.startTime)}${visit.endTime ? `–${time12(visit.endTime)}` : ""}` : ""}
            </p>
          )}
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
            </div>
            <div className="space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
              {totals.discount > 0 && <div className="flex justify-between"><span>{discountLabel(text(data.discountType), text(data.discountValue))}</span><span>-${totals.discount.toFixed(2)}</span></div>}
              <div className="flex justify-between"><span>Tax</span><span>${totals.tax.toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
              {doc?.type === "proposal" && Number(text(data.depositPercent)) > 0 && <div className="flex justify-between" data-testid="approve-deposit-request"><span>Deposit requested ({text(data.depositPercent)}%)</span><span>${(totals.total * Number(text(data.depositPercent)) / 100).toFixed(2)}</span></div>}
              {/* R59: payments (e.g. a deposit) under Total, then the balance. */}
              {payments.filter((payment) => amountOf(payment.amount) > 0 && !isRefundRow(payment)).map((payment, index) => (
                <div key={payment.id} className="flex items-start justify-between gap-3 py-0.5 text-emerald-700" data-testid="approve-payment">
                  <span className="min-w-0">{index === 0 && (isProposal || stages.some((stage) => stage.kind === "deposit")) ? "Deposit paid" : "Paid"}{payment.date ? ` ${niceDate(payment.date)}` : ""}{payment.method ? ` · ${payment.method}` : ""}</span>
                  <span className="shrink-0 text-right font-medium tabular-nums">-${amountOf(payment.amount).toFixed(2)}</span>
                </div>
              ))}
              {refundRows.map((payment) => (
                <div key={payment.id} className="flex items-start justify-between gap-3 py-0.5 text-slate-700" data-testid="approve-refund">
                  <span className="min-w-0">Refunded to you{payment.date ? ` ${niceDate(payment.date)}` : ""}</span>
                  <span className="shrink-0 text-right font-medium tabular-nums">+${Math.abs(Number(String(payment.amount).replace(/[^0-9.-]/g, "")) || 0).toFixed(2)}</span>
                </div>
              ))}
              {!isProposal && (
                <div className="mt-2 flex items-baseline justify-between gap-3 cr-tone-teal rounded-xl border border-teal-500/30 bg-teal-50 px-4 py-3 text-xl font-bold tabular-nums text-teal-900 print:bg-transparent print:px-0" data-testid="approve-owed">
                  <span>{paidInFull ? "Paid in full" : totals.paid > 0.004 ? "Remaining balance" : "Amount due"}</span><span>${totals.balance.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {!isProposal && !paidInFull && totals.balance > 0.004 && (cardEnabled || payMessage) && (
            <div className="print-hide mt-4 cr-tone-teal rounded-xl border border-teal-500/30 bg-teal-50 p-4 text-sm text-slate-800" data-testid="card-pay">
              {cardEnabled && totals.balance >= 0.5 && (
                <button type="button" data-testid="pay-card" disabled={paying} onClick={() => payByCard(false)} className="min-h-14 w-full rounded-xl bg-teal-600 px-6 py-3 text-lg font-semibold text-white! shadow-md transition hover:bg-teal-500 disabled:opacity-60">
                  {paying ? "Opening secure checkout…" : `Pay $${payNow.toFixed(2)} by card`}
                </button>
              )}
              {cardEnabled && payNow < totals.balance && totals.balance >= 0.5 && (
                <button type="button" data-testid="pay-card-full" disabled={paying} onClick={() => payByCard(true)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-teal-700 underline dark:text-teal-300">
                  or pay the full balance ${totals.balance.toFixed(2)}
                </button>
              )}
              {payMessage && <p className="mt-2" data-testid="pay-message">{payMessage}</p>}
              {cardEnabled && totals.balance >= 0.5 && <p className="mt-2 text-xs text-slate-500">Secure checkout by Stripe. {payNow < totals.balance ? "You pay the amount due now; the rest follows the payment schedule." : "You pay what is still owed."}</p>}
            </div>
          )}
          {!isProposal && !paidInFull && text(data.status) !== "paid" && totals.balance > 0.004 && <PayOptions config={payMethods} amount={payNow} reference={number} publicCopy dueNote={stages.length && payNow < totals.balance - 0.004 ? `Payment plan: $${payNow.toFixed(2)} now (of $${totals.balance.toFixed(2)} still owed)` : ""} />}
          {!isProposal && <StageSchedule stages={stages} total={totals.total} balance={totals.balance} awaitingApproval={awaitingApproval} jobDone={jobDone} />}
          {text(data.notes) && <p className="mt-3 text-sm text-slate-600">{text(data.notes)}</p>}
          {data.showPhotos === true && <JobPhotoStrip photos={readPhotos(data.photos)} />}
          {((payUrl && !isProposal && !paidInFull && totals.balance > 0.004 && !canCard) || signature || proposalSignature) && (
            <div className="print-keep mt-4 grid items-end gap-6 border-t border-slate-200 pt-4 sm:grid-cols-2">
              <div className="space-y-3">
                <SignatureBlock signature={proposalSignature} label="Proposal accepted" />
                <SignatureBlock signature={signature} />
              </div>
              <div className="flex justify-end">{!isProposal && !paidInFull && totals.balance > 0.004 && !canCard && <PayQr url={payUrl} />}</div>
            </div>
          )}
        </div>

        {needsApproval && (
          <div className="print-hide rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5" data-testid="approve-panel">
            {approved ? (
              <div className="space-y-2">
                <p className="font-semibold text-emerald-700" data-testid="approve-done">
                  Approved{approval?.approvedAt ? ` on ${new Date(approval.approvedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}` : ""}
                  {approval?.approverName ? ` by ${approval.approverName}` : ""}. Thank you!
                </p>
                {approvalSignature && <div data-testid="approval-signature"><SignatureBlock signature={approvalSignature} label="Approved and signed" /></div>}
                {isProposal && invoiceLink && (
                  <a href={invoiceLink.href} data-testid="approve-invoice-link" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-teal-600 px-5 text-base font-semibold text-white! shadow-md">
                    View your invoice{invoiceLink.number ? ` ${invoiceLink.number}` : ""}{depositAmount > 0 ? " and pay the deposit" : ""}
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-slate-900">Approve and sign</h2>
                <p className="text-slate-700" data-testid="approve-summary">
                  <span className="font-semibold">{doc.business.name || "Your contractor"}</span> sent {isProposal ? "a proposal" : "a change order"} ({number}) for <span className="font-semibold tabular-nums">${totals.total.toFixed(2)}</span>.{isProposal && depositAmount > 0 ? ` A ${depositPercent}% deposit ($${depositAmount.toFixed(2)}) is due when you approve; the rest when the job is done.` : isProposal ? " Nothing is due until the job is done." : ""} No account needed.
                </p>
                <label className="flex flex-col gap-1.5 font-medium text-slate-700">
                  Your name
                  <input aria-label="Your name" data-testid="approve-name" value={name} maxLength={100} autoComplete="name" onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-normal text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 sm:text-sm" />
                </label>
                <div data-testid="portal-sign">
                  <p className="mb-1 font-medium text-slate-700">Signature <span className="font-normal text-slate-500">(draw, or switch to Type; your name above also counts as a typed signature)</span></p>
                  <SignaturePad value={mySignature} onChange={setMySignature} defaultName={name} hideName autoCommit />
                </div>
                {isProposal && depositAmount > 0 && cardEnabled ? (
                  <button type="button" data-testid="approve-and-pay" disabled={busy || paying} onClick={() => approve(true)} className="min-h-14 w-full rounded-xl bg-teal-600 px-5 text-lg font-semibold text-white! shadow-md transition hover:bg-teal-500 disabled:opacity-60">
                    {busy || paying ? "One moment…" : `Approve & pay deposit $${depositAmount.toFixed(2)}`}
                  </button>
                ) : (
                  <button type="button" data-testid="approve-one-tap" disabled={busy} onClick={() => approve(false)} className="min-h-14 w-full rounded-xl bg-emerald-600 px-5 text-lg font-semibold text-white! shadow-md transition hover:bg-emerald-500 disabled:opacity-60">
                    {busy ? "Approving…" : "Approve"}
                  </button>
                )}
                {isProposal && depositAmount > 0 && cardEnabled && (
                  <button type="button" data-testid="approve-one-tap" disabled={busy || paying} onClick={() => approve(false)} className="min-h-11 w-full rounded-lg text-sm font-medium text-slate-600 underline">Approve now, pay the deposit another way</button>
                )}
              </div>
            )}
            {message && <p className="cr-tone-bad mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
          </div>
        )}
        <div className="print-hide flex justify-end">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-teal-500 hover:text-teal-700 max-sm:w-full">Print / Save PDF</button>
        </div>
        {showRating && <RatingBox target={{ token, portal }} />}
      </section>
      <LegalLinks className="mt-8 text-center" />
    </main>
  );
}
