import { emailConfig } from "@/lib/email-server";
import { clientIp, rateLimited, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Sends one owner-written email (the owner clicked Send after reviewing it). Requires the owner's
 * session, a document the owner owns, one recipient; plain text only. Nothing else sends email.
 */
export async function POST(request: Request) {
  const config = emailConfig();
  if (!config.enabled) return fail(503, "Email sending is not set up. Use “Open in email app”.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in first.");
  if (rateLimited(`email:${clientIp(request)}`, 20, 60_000)) return tooMany();
  const body = (await request.json().catch(() => null)) as { docId?: unknown; to?: unknown; subject?: unknown; text?: unknown } | null;
  const docId = String(body?.docId || "");
  const to = String(body?.to || "").trim();
  const subject = String(body?.subject || "").replace(/[\r\n]+/g, " ").trim();
  const text = String(body?.text || "");
  if (!UUID.test(docId)) return fail(400, "Save this document to your account first.");
  if (!EMAIL.test(to)) return fail(400, "Enter one valid email address.");
  if (!subject || subject.length > 200) return fail(400, "Add a subject (up to 200 characters).");
  if (!text.trim() || text.length > 20000) return fail(400, "Add a message (up to 20,000 characters).");

  const headers = { apikey: config.anonKey, authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers }).catch(() => null);
  if (!userResponse?.ok) return fail(401, "Sign in again, then send.");
  const user = (await userResponse.json().catch(() => null)) as { id?: string; email?: string } | null;
  if (!user?.id) return fail(401, "Sign in again, then send.");
  // Row-level security: this only finds the document when it belongs to the signed-in owner.
  const docResponse = await fetch(`${config.supabaseUrl}/rest/v1/documents?select=id&id=eq.${docId}&user_id=eq.${user.id}`, { headers }).catch(() => null);
  const rows = docResponse?.ok ? ((await docResponse.json().catch(() => [])) as unknown[]) : [];
  if (!Array.isArray(rows) || rows.length !== 1) return fail(404, "Document not found in your account.");

  const sendResponse = await fetch(`${config.apiBase}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.from, to: [to], subject, text, ...(user.email ? { reply_to: user.email } : {}) }),
  }).catch(() => null);
  if (!sendResponse?.ok) return fail(502, "The email provider did not accept the email. It was not sent.");
  const sent = (await sendResponse.json().catch(() => ({}))) as { id?: string };
  return Response.json({ id: String(sent.id || "") });
}
