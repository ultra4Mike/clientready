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
  const { charge, staged } = amountToCharge(data, full);
  const cents = Math.round(charge * 100);
  if (cents < 50) return Response.json({ error: "Nothing is owed on this invoice." }, { status: 400 });

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
  });
  if (typeof data.clientEmail === "string" && /.+@.+\..+/.test(data.clientEmail)) form.set("customer_email", data.clientEmail);

  const response = await fetch(`${config.apiBase}/v1/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const session = (await response.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!response.ok || !session.url) return Response.json({ error: "Could not start card payment. Try again later." }, { status: 502 });
  return Response.json({ url: session.url });
}
