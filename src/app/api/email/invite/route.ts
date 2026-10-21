import { emailConfig } from "@/lib/email-server";
import { inviteText } from "@/lib/crew-invite";
import { clientIp, rateLimited, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export async function POST(request: Request) {
  const config = emailConfig();
  if (!config.enabled) return fail(503, "Email sending is not set up. Use “Open in email app”.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in first.");
  if (rateLimited(`invite:${clientIp(request)}`, 10, 60_000)) return tooMany();
  const body = (await request.json().catch(() => null)) as { employeeId?: unknown } | null;
  const employeeId = String(body?.employeeId || "");
  if (!employeeId || employeeId.length > 100) return fail(400, "Pick an employee.");
  const headers = { apikey: config.anonKey, authorization: `Bearer ${token}` };
  const rest = (path: string, init?: RequestInit) => fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, "content-type": "application/json", ...(init?.headers || {}) } }).catch(() => null);
  const userResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers }).catch(() => null);
  const user = userResponse?.ok ? ((await userResponse.json().catch(() => null)) as { id?: string; email?: string } | null) : null;
  if (!user?.id) return fail(401, "Sign in again, then send.");
  const empResponse = await rest(`employees?select=name,email,active&id=eq.${encodeURIComponent(employeeId)}&user_id=eq.${user.id}`);
  const person = ((empResponse?.ok ? await empResponse.json().catch(() => []) : []) as { name?: string; email?: string; active?: boolean }[])[0];
  const to = String(person?.email || "").trim().toLowerCase();
  if (!person || person.active === false) return fail(404, "Employee not found (or not active).");
  if (!EMAIL.test(to)) return fail(400, "Save this person's email on the Employees page first.");
  const profileResponse = await rest(`profiles?select=business_name&id=eq.${user.id}`);
  const business = String((((profileResponse?.ok ? await profileResponse.json().catch(() => []) : []) as Record<string, unknown>[])[0] || {}).business_name || "");
  const quotaResponse = await rest("rpc/email_quota_take", { method: "POST", body: "{}" });
  const quota = quotaResponse?.ok ? await quotaResponse.json().catch(() => null) : null;
  if (quota !== "") return fail(429, quota === "day" ? "Daily email limit reached (100). Try again tomorrow." : "Too many emails at once. Wait a minute and try again.");
  const { subject, text } = inviteText(business, String(person.name || ""), new URL(request.url).origin, to);
  const sendResponse = await fetch(`${config.apiBase}/emails`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.from, to: [to], subject, text, ...(user.email ? { reply_to: user.email } : {}) }),
  }).catch(() => null);
  if (!sendResponse?.ok) return fail(502, "The email provider did not accept the email. It was not sent.");
  return Response.json({ to, subject });
}
