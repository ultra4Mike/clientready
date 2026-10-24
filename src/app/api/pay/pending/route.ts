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

const UUID = /^[0-9a-f-]{36}$/i;

/** Of these invoice ids, which exist and who owns them (id → user_id). */
async function docOwners(ids: string[]) {
  const out = new Map<string, string>();
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (!valid.length) return out;
  const { data } = await serviceClient().from("documents").select("id, user_id").in("id", valid);
  for (const doc of (data || []) as { id: string; user_id: string }[]) out.set(doc.id, doc.user_id);
  return out;
}

/**
 * Unresolved card payments for this owner, filtered in the query: rows stamped with their owner_id,
 * plus older unstamped rows (before migration 20261015140000) whose invoice they own. A stamped row
 * whose invoice now belongs to someone else is never shown. Empty if the table is missing.
 */
async function pendingFor(ownerId: string): Promise<Pending[]> {
  const table = () => serviceClient().from("stripe_pending_payments");
  const mine = await table().select("*").eq("owner_id", ownerId).is("resolved_at", null).order("created_at", { ascending: true }).limit(200);
  const hasOwnerColumn = !mine.error || !/owner_id/.test(mine.error.message || "");
  if (mine.error && hasOwnerColumn) return [];
  let rows = (mine.data || []) as Pending[];
  // Unstamped rows: only those pointing at this owner's invoices. QA2 (R11): filtered by this owner's own invoice
  // ids in the query, so other accounts' old unstamped rows can't fill a shared 200-row cap and hide this owner's.
  const looseRows: Pending[] = [];
  const myDocs = await serviceClient().from("documents").select("id").eq("user_id", ownerId).eq("type", "invoice").limit(10000);
  const myIds = ((myDocs.data || []) as { id: string }[]).map((doc) => doc.id);
  for (let at = 0; at < myIds.length && looseRows.length < 200; at += 150) {
    const chunk = myIds.slice(at, at + 150);
    const part = hasOwnerColumn
      ? await table().select("*").is("owner_id", null).is("resolved_at", null).in("doc_id", chunk).order("created_at", { ascending: true }).limit(200)
      : await table().select("*").is("resolved_at", null).in("doc_id", chunk).order("created_at", { ascending: true }).limit(200);
    looseRows.push(...((part.data || []) as Pending[]));
  }
  const loose = { data: looseRows.slice(0, 200) };
  const owners = await docOwners([...rows, ...((loose.data || []) as Pending[])].map((row) => row.doc_id || ""));
  rows = rows.filter((row) => !owners.has(row.doc_id || "") || owners.get(row.doc_id || "") === ownerId);
  const extra = ((loose.data || []) as Pending[]).filter((row) => owners.get(row.doc_id || "") === ownerId);
  return [...rows, ...extra].sort((x, y) => x.created_at.localeCompare(y.created_at));
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
