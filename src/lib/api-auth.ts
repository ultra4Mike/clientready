/**
 * Server-side check that a request comes from a signed-in ClientReady user (owner or crew; both sign in with
 * Supabase). Verifies the Bearer access token with Supabase Auth and caches the answer briefly per instance,
 * so a timesheet warming many legs doesn't call Auth for every one.
 */
const verified = new Map<string, { userId: string; until: number }>();
const TTL_MS = 5 * 60_000;

export function bearerToken(request: Request) {
  const raw = (request.headers.get("authorization") || "").trim();
  const m = raw.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : "";
}

export async function signedInUserId(
  request: Request,
  opts: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: number } = {},
): Promise<string | null> {
  const token = bearerToken(request);
  if (!token || token.length < 20 || token.length > 4096) return null;
  const now = opts.now ?? Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return hit.userId;
  const env = opts.env || process.env;
  const base = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!base || !anon) return null;
  try {
    const res = await (opts.fetcher || fetch)(`${base}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof user?.id === "string" ? user.id : "";
    if (!id) return null;
    if (verified.size > 2000) for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
    verified.set(token, { userId: id, until: now + TTL_MS });
    return id;
  } catch {
    return null;
  }
}

/** Test hook. */
export function clearAuthCache() { verified.clear(); }
