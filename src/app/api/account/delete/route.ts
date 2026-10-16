export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const RECENT_SECONDS = 5 * 60;
const attempts = new Map<string, number[]>();

function config() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { supabaseUrl, anonKey, serviceKey, enabled: Boolean(supabaseUrl && anonKey && serviceKey) };
}

/** Seconds since the token was issued (the token is verified by Supabase before this matters). */
function tokenAge(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { iat?: number };
    return payload.iat ? Date.now() / 1000 - payload.iat : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Deletes the signed-in user's account. The user id always comes from the verified session, never
 * from the request. Requires a sign-in from the last 5 minutes (password or emailed link), then:
 * 1) delete_my_account() as that user removes every owned row in one transaction;
 * 2) the auth user is deleted with the service role.
 */
export async function POST(request: Request) {
  const { supabaseUrl, anonKey, serviceKey, enabled } = config();
  if (!enabled) return fail(503, "Account deletion isn't available right now. Email support and we'll delete it for you.");
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "Sign in first.");
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== "DELETE") return fail(400, "Type DELETE to confirm.");

  const headers = { apikey: anonKey, authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers }).catch(() => null);
  if (!userResponse?.ok) return fail(401, "Sign in again, then delete.");
  const user = (await userResponse.json().catch(() => null)) as { id?: string } | null;
  if (!user?.id) return fail(401, "Sign in again, then delete.");
  if (tokenAge(token) > RECENT_SECONDS) return fail(403, "For safety, confirm your password (or use an emailed link) again, then delete.");

  const now = Date.now();
  const recent = (attempts.get(user.id) || []).filter((at) => now - at < 10 * 60 * 1000);
  if (recent.length >= 3) return fail(429, "Too many tries. Wait a few minutes.");
  attempts.set(user.id, [...recent, now]);

  const rows = await fetch(`${supabaseUrl}/rest/v1/rpc/delete_my_account`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" }).catch(() => null);
  if (!rows?.ok) return fail(502, "Could not delete your data. Nothing was removed; try again.");
  const deleted = await rows.json().catch(() => ({}));

  const auth = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  }).catch(() => null);
  // 404: already gone (a repeat call), which is fine.
  if (!auth || (!auth.ok && auth.status !== 404)) return fail(502, "Your data was deleted, but the login could not be removed. Try again to finish.");
  return Response.json({ ok: true, deleted });
}
