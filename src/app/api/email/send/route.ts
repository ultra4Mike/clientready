import { createHash } from "node:crypto";
import { emailConfig } from "@/lib/email-server";
import { planOne, readAutomations, type AutoDoc } from "@/lib/automation-email";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Sends one email for a document the signed-in owner owns, only to that document's client (R50).
 * - Manual: owner-written text, after the owner reviewed it and clicked Send.
 * - Automated ({ automation: { kind, period } }): the text is rebuilt here from the saved invoice (templated
 *   only), the matching switch must be on, and (doc, kind, period) is claimed on the server before sending
 *   so it can't go twice (R46); a failed send releases the claim.
 * Per-owner limits: 10 a minute, 100 a day (R50).
 */
export async function POST(request: Request) {
  const config = emailConfig();
  // QA2: sign-in is checked before "not set up", so the route says nothing about setup to signed-out callers.
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in first.");
  if (await rateLimitedShared(`email:${clientIp(request)}`, 20, 60_000)) return tooMany();
  if (config.supabaseUrl && config.anonKey) {
    const who = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.anonKey, authorization: `Bearer ${token}` } }).catch(() => null);
    if (!who?.ok) return fail(401, "Sign in again, then send.");
  } else return fail(401, "Sign in again, then send.");
  if (!config.enabled) return fail(503, "Email sending is not set up. Use “Open in email app”.");
  const body = (await request.json().catch(() => null)) as { requestId?: unknown; docId?: unknown; to?: unknown; subject?: unknown; text?: unknown; automation?: { kind?: unknown; period?: unknown }; today?: unknown } | null;
  const docId = String(body?.docId || "");
  if (!UUID.test(docId)) return fail(400, "Save this document to your account first.");
  const auto = body?.automation && typeof body.automation === "object" ? { kind: String(body.automation.kind || ""), period: String(body.automation.period || "") } : null;
  if (auto && !(auto.kind === "done" || auto.kind === "late")) return fail(400, "Unknown automation.");

  const headers = { apikey: config.anonKey, authorization: `Bearer ${token}` };
  const rest = (path: string, init?: RequestInit) => fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, "content-type": "application/json", ...(init?.headers || {}) } }).catch(() => null);
  const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers }).catch(() => null);
  if (!userResponse?.ok) return fail(401, "Sign in again, then send.");
  const user = (await userResponse.json().catch(() => null)) as { id?: string; email?: string } | null;
  if (!user?.id) return fail(401, "Sign in again, then send.");
  // Row-level security: this only finds the document when it belongs to the signed-in owner.
  const docResponse = await rest(`documents?select=id,type,title,client_name,data&id=eq.${docId}&user_id=eq.${user.id}`);
  const rows = docResponse?.ok ? ((await docResponse.json().catch(() => [])) as { id: string; type: string; title: string; client_name: string; data: Record<string, unknown> }[]) : [];
  if (!Array.isArray(rows) || rows.length !== 1) return fail(404, "Document not found in your account.");
  const row = rows[0];
  const clientEmail = String(row.data?.clientEmail || "").trim();

  let to = String(body?.to || "").trim();
  let subject = String(body?.subject || "").replace(/[\r\n]+/g, " ").trim();
  let text = String(body?.text || "");
  if (auto) {
    const profileResponse = await rest(`profiles?select=business_name,review_link,automations&id=eq.${user.id}`);
    const profile = ((profileResponse?.ok ? await profileResponse.json().catch(() => []) : []) as Record<string, unknown>[])[0] || {};
    const clientId = String(row.data?.clientId || "");
    const clientQuery = clientId ? `id=eq.${encodeURIComponent(clientId)}` : `name=ilike.${encodeURIComponent(String(row.client_name || row.data?.clientName || "").replace(/[%_*]/g, ""))}`;
    const clientResponse = await rest(`clients?select=review_opt_out,auto_email_opt_out&${clientQuery}&limit=1`);
    const client = ((clientResponse?.ok ? await clientResponse.json().catch(() => []) : []) as Record<string, unknown>[])[0] || {};
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.today || "")) ? String(body?.today) : new Date().toISOString().slice(0, 10);
    const doc: AutoDoc = { id: row.id, type: row.type, title: row.title, clientName: row.client_name, data: row.data || {} };
    // Option A: the change-order chain (original + its change orders), so replaced versions and revision owed match the app.
    const rootId = String((row.data?.changeOrderOf as { id?: unknown } | undefined)?.id || row.id);
    const chainResponse = UUID.test(rootId) ? await rest(`documents?select=id,type,title,client_name,data&user_id=eq.${user.id}&or=(id.eq.${rootId},data->changeOrderOf->>id.eq.${rootId})`) : null;
    const chainRows = chainResponse?.ok ? ((await chainResponse.json().catch(() => [])) as typeof rows) : [];
    const chain: AutoDoc[] = [doc, ...(Array.isArray(chainRows) ? chainRows : []).filter((r) => r.id !== row.id).map((r) => ({ id: r.id, type: r.type, title: r.title, clientName: r.client_name, data: r.data || {} }))];
    const plan = planOne(doc, readAutomations(profile.automations), {
      business: String(profile.business_name || ""), reviewLink: String(profile.review_link || ""), origin: new URL(request.url).origin, today,
      reviewOptOut: client.review_opt_out === true, autoOptOut: client.auto_email_opt_out === true, chain,
    });
    if (!plan || plan.kind !== auto.kind || plan.period !== auto.period) return fail(409, "Nothing to send for this invoice (already sent, turned off, a draft, or not due).");
    ({ to, subject, text } = plan);
  } else {
    if (!EMAIL.test(to)) return fail(400, "Enter one valid email address.");
    if (!subject || subject.length > 200) return fail(400, "Add a subject (up to 200 characters).");
    if (!text.trim() || text.length > 20000) return fail(400, "Add a message (up to 20,000 characters).");
  }
  if (!clientEmail || to.toLowerCase() !== clientEmail.toLowerCase()) return fail(400, "Emails go to this document's client. Save the client's email on the document first.");

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const response = await rest(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
    return response?.ok ? response.json().catch(() => null) : null;
  };
  // R76: an automated send claims first, so "Already sent" never uses up a slot of the email limit.
  const claim = auto ? { p_doc: docId, p_kind: auto.kind, p_period: auto.period } : null;
  if (claim && (await rpc("claim_automation_send", claim)) !== true) return fail(409, "Already sent.");
  const quota = await rpc("email_quota_take", {});
  if (quota !== "") {
    if (claim) await rpc("release_automation_send", claim);
    return fail(429, quota === "day" ? "Daily email limit reached (100). Try again tomorrow." : "Too many emails at once. Wait a minute and try again.");
  }

  // QA2: an idempotency key, so a retry after a lost reply (the provider already accepted it) never sends twice.
  // Automated: one per (doc, kind, period). Manual: the app's request id, else the exact message within the hour.
  const requestId = UUID.test(String(body?.requestId || "")) ? String(body?.requestId) : "";
  const idem = createHash("sha256").update(auto ? `auto|${user.id}|${docId}|${auto.kind}|${auto.period}`
    : requestId ? `req|${user.id}|${requestId}` : `msg|${user.id}|${docId}|${to}|${subject}|${text}|${new Date().toISOString().slice(0, 13)}`).digest("hex").slice(0, 64);
  const sendResponse = await fetch(`${config.apiBase}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "idempotency-key": `cr-email-${idem}` },
    body: JSON.stringify({ from: config.from, to: [to], subject, text, ...(user.email ? { reply_to: user.email } : {}) }),
  }).catch(() => null);
  if (!sendResponse) {
    // QA2: no reply at all — the provider may have accepted it. Keep the claim and the counted slot (so an
    // automated send can't go twice); a manual retry reuses the same idempotency key, so it can't duplicate.
    return fail(504, "Could not confirm the email was sent. Check your sent log before sending again; sending again with the same text won't send it twice.");
  }
  if (!sendResponse.ok) {
    // QA2: the provider refused it, so nothing went out: give the quota slot back and release the claim.
    await rpc("email_quota_give_back", {});
    if (claim) await rpc("release_automation_send", claim);
    return fail(502, "The email provider did not accept the email. It was not sent.");
  }
  const sent = (await sendResponse.json().catch(() => ({}))) as { id?: string };
  return Response.json({ id: String(sent.id || ""), to, subject, ...(auto ? { text } : {}) });
}
