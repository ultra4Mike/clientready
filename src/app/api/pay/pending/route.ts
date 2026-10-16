import { serviceClient, stripeConfig } from "@/lib/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pending = { session_id: string; event_id: string | null; doc_id: string | null; amount: number; paid_at: string; ref: string; attempts: number; created_at: string; owner_id?: string | null };

/** The signed-in owner (from the Bearer token), or null. */
async function ownerFrom(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await serviceClient().auth.getUser(token);
  return data.user?.id || null;
}

/** Unresolved card payments for this owner: matched by owner_id, or by an invoice they own. Empty if the table is missing. */
async function pendingFor(ownerId: string): Promise<Pending[]> {
  const { data, error } = await serviceClient().from("stripe_pending_payments").select("*").is("resolved_at", null).order("created_at", { ascending: true }).limit(200);
  if (error || !Array.isArray(data)) return [];
  const rows = data as Pending[];
  const docIds = rows.map((row) => row.doc_id || "").filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const owned = new Set<string>();
  if (docIds.length) {
    const { data: docs } = await serviceClient().from("documents").select("id").eq("user_id", ownerId).in("id", docIds);
    for (const doc of (docs || []) as { id: string }[]) owned.add(doc.id);
  }
  return rows.filter((row) => row.owner_id === ownerId || owned.has(row.doc_id || ""));
}

const view = (row: Pending) => ({ sessionId: row.session_id, docId: row.doc_id, amount: Number(row.amount), paidAt: row.paid_at, ref: row.ref, attempts: row.attempts });

export async function GET(request: Request) {
  const config = stripeConfig();
  if (!config.webhookEnabled) return Response.json({ pending: [] });
  const ownerId = await ownerFrom(request);
  if (!ownerId) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json({ pending: (await pendingFor(ownerId)).map(view) });
}

/** Retry recording one pending payment ({ sessionId }). Idempotent: never records the same payment twice. */
export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config.webhookEnabled) return Response.json({ error: "Card payments are not set up." }, { status: 503 });
  const ownerId = await ownerFrom(request);
  if (!ownerId) return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const row = (await pendingFor(ownerId)).find((item) => item.session_id === String(body?.sessionId || ""));
  if (!row) return Response.json({ error: "Payment not found." }, { status: 404 });
  const { data, error } = await serviceClient().rpc("record_stripe_payment_v2", {
    p_doc_id: row.doc_id || "",
    p_session_id: row.session_id,
    p_amount: Number(row.amount),
    p_paid_at: row.paid_at,
    p_ref: row.ref,
    p_event_id: row.event_id || "",
    p_default_tz: process.env.BUSINESS_TIMEZONE || "America/Chicago",
  });
  if (error) return Response.json({ error: "Could not record the payment. Try again later." }, { status: 500 });
  return Response.json({ result: data });
}
