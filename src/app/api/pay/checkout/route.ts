import { amountToCharge, serviceClient, stripeConfig } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a Stripe Checkout for what is still owed on the invoice behind an approval link
 * ({ token }) or a client portal link ({ portal, docId }).
 * The amount is always computed here from the saved invoice, never taken from the browser.
 */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.checkoutEnabled) return Response.json({ error: "Card payment is not set up." }, { status: 503 });
  let token = "";
  let portal = "";
  let docId = "";
  let full = false;
  try {
    const body = (await request.json()) as { token?: unknown; portal?: unknown; docId?: unknown; full?: unknown };
    full = body.full === true;
    token = String(body.token || "");
    portal = String(body.portal || "");
    docId = String(body.docId || "");
  } catch {
    token = "";
  }
  const viaPortal = portal.length >= 32 && /^[0-9a-f-]{36}$/i.test(docId);
  if (!viaPortal && token.length < 32) return Response.json({ error: "Link not found." }, { status: 404 });

  const { data: rows, error } = viaPortal
    ? await serviceClient().rpc("stripe_invoice_for_portal", { p_token: portal, p_doc_id: docId })
    : await serviceClient().rpc("stripe_invoice_for_token", { p_token: token });
  const doc = Array.isArray(rows) ? rows[0] : rows;
  if (error || !doc) return Response.json({ error: "Link not found." }, { status: 404 });
  if (doc.type !== "invoice") return Response.json({ error: "Only invoices can be paid online." }, { status: 400 });
  const data = (doc.data || {}) as Record<string, unknown>;
  // Progress billing: the current stage's amount unless the customer chose to pay the full balance.
  const { charge, owed, staged } = amountToCharge(data, full);
  // Never charge more than the saved remaining balance.
  const cents = Math.round(Math.min(charge, owed) * 100);
  if (cents < 50) return Response.json({ error: "Nothing is owed on this invoice." }, { status: 400 });

  // Reuse an open Checkout for the same invoice and amount; expire stale ones so a client can't pay
  // twice from two tabs. Skipped quietly until migration 20261015130000 creates the table.
  const sessions = () => serviceClient().from("stripe_checkout_sessions");
  const auth = { Authorization: `Bearer ${config.secretKey}` };
  const { data: openRows, error: openError } = await sessions().select("session_id, cents, url, expires_at, created_at").eq("doc_id", String(doc.id)).eq("status", "open");
  if (!openError && Array.isArray(openRows)) {
    for (const row of openRows as { session_id: string; cents: number; url: string; expires_at: string; created_at: string }[]) {
      if (row.session_id.startsWith("claim_")) {
        // Another request is creating a Checkout right now (claim row from migration 20261015140000).
        if (Date.now() - new Date(row.created_at).getTime() < 120_000) return Response.json({ error: "A payment is already starting for this invoice. Try again in a moment." }, { status: 409 });
        await sessions().update({ status: "expired" }).eq("session_id", row.session_id);
        continue;
      }
      const live = await fetch(`${config.apiBase}/v1/checkout/sessions/${encodeURIComponent(row.session_id)}`, { headers: auth })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { status?: string; payment_status?: string } | null;
      if (live?.status === "complete" || live?.payment_status === "paid") {
        // Paid but not recorded yet (webhook pending): don't start another payment.
        await sessions().update({ status: "complete" }).eq("session_id", row.session_id);
        return Response.json({ error: "A payment for this invoice is already being processed. Refresh in a minute." }, { status: 409 });
      }
      if (live?.status === "open" && row.cents === cents && new Date(row.expires_at).getTime() > Date.now() + 60_000) {
        return Response.json({ url: row.url });
      }
      if (live?.status === "open") await fetch(`${config.apiBase}/v1/checkout/sessions/${encodeURIComponent(row.session_id)}/expire`, { method: "POST", headers: auth }).catch(() => null);
      await sessions().update({ status: "expired" }).eq("session_id", row.session_id);
    }
  }

  // Claim the invoice before calling Stripe. With migration 20261015140000 a unique index allows one
  // open row per invoice, so a near-simultaneous second request fails here (23505) and is refused.
  const { data: ownerRow } = await serviceClient().from("documents").select("user_id").eq("id", String(doc.id)).maybeSingle();
  const ownerId = (ownerRow as { user_id?: string } | null)?.user_id || null;
  const claimId = `claim_${crypto.randomUUID()}`;
  let claimed = false;
  if (!openError) {
    const claimRow = { session_id: claimId, doc_id: String(doc.id), cents, url: "", expires_at: new Date(Date.now() + 120_000).toISOString() };
    let claim = await sessions().insert({ ...claimRow, owner_id: ownerId });
    if (claim.error && /owner_id/.test(claim.error.message || "")) claim = await sessions().insert(claimRow);
    if (claim.error?.code === "23505") return Response.json({ error: "A payment is already starting for this invoice. Try again in a moment." }, { status: 409 });
    claimed = !claim.error;
  }

  const origin = request.headers.get("origin") || new URL(request.url).origin;
  const back = viaPortal
    ? `${origin}/approve?p=${encodeURIComponent(portal)}&d=${encodeURIComponent(docId)}`
    : `${origin}/approve?t=${encodeURIComponent(token)}`;
  const number = String(data.invoiceNumber || doc.title || "Invoice");
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${back}&paid=1`,
    cancel_url: back,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": config.currency,
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": `${number} · ${staged ? "payment due now" : "balance due"}`,
    "metadata[doc_id]": String(doc.id),
    "metadata[owed_cents]": String(cents),
    "payment_intent_data[metadata][doc_id]": String(doc.id),
    client_reference_id: String(doc.id),
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
  });
  if (typeof data.clientEmail === "string" && /.+@.+\..+/.test(data.clientEmail)) form.set("customer_email", data.clientEmail);

  const response = await fetch(`${config.apiBase}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const session = (await response.json().catch(() => ({}))) as { id?: string; url?: string; expires_at?: number; error?: { message?: string } };
  if (!response.ok || !session.url) {
    if (claimed) await sessions().delete().eq("session_id", claimId);
    return Response.json({ error: "Could not start card payment. Try again later." }, { status: 502 });
  }
  const expiresAt = new Date((session.expires_at || Math.floor(Date.now() / 1000) + 1800) * 1000).toISOString();
  if (claimed && session.id) {
    // Turn the claim into the real session row (keeps the one-open-per-invoice guarantee).
    await sessions().update({ session_id: session.id, url: session.url, expires_at: expiresAt }).eq("session_id", claimId);
  } else if (!openError && session.id) {
    await sessions().insert({ session_id: session.id, doc_id: String(doc.id), cents, url: session.url, expires_at: expiresAt });
  }
  return Response.json({ url: session.url });
}
