import { chainInfo } from "@/lib/chain-server";
import { serviceClient, stripeConfig } from "@/lib/stripe-server";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Option A: for a client link (approval token, or portal token + doc id), says whether the invoice was
 * replaced by a sent revision change order (no pay button, link forward) or, for a revision, what was
 * already paid on earlier versions and the net balance. Read only; amounts only, no other documents' data.
 */
export async function POST(request: Request) {
  if (await rateLimitedShared(`chain:${clientIp(request)}`, 30, 60_000)) return tooMany();
  const body = (await request.json().catch(() => null)) as { token?: unknown; portal?: unknown; docId?: unknown } | null;
  const token = String(body?.token || ""), portal = String(body?.portal || ""), docId = String(body?.docId || "");
  const viaPortal = portal.length >= 32 && /^[0-9a-f-]{36}$/i.test(docId);
  if (!viaPortal && token.length < 32) return Response.json({}, { status: 404 });
  if (!stripeConfig().serviceKey) return Response.json({});
  try {
    const { data: rows, error } = viaPortal
      ? await serviceClient().rpc("stripe_invoice_for_portal", { p_token: portal, p_doc_id: docId })
      : await serviceClient().rpc("stripe_invoice_for_token", { p_token: token });
    const doc = Array.isArray(rows) ? rows[0] : rows;
    if (error || !doc || doc.type !== "invoice") return Response.json({});
    return Response.json(await chainInfo(doc));
  } catch {
    return Response.json({});
  }
}
