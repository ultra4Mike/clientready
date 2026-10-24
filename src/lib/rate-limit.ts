/**
 * Rate limiting for API routes (fixed window).
 * - Shared store (all serverless instances): Upstash Redis REST or Vercel KV, used only when its env vars are set
 *   (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN).
 * - Otherwise (or if the store errors) a best-effort per-instance in-memory Map.
 * Keys use the client IP that Vercel sets itself (not the client-supplied x-forwarded-for).
 */
const hits = new Map<string, { count: number; reset: number }>();

const firstIp = (value: string | null) => (value || "").split(",")[0].trim();

/**
 * Trusted client IP. On Vercel, x-vercel-forwarded-for / x-real-ip are set by the edge and can't be forged by the
 * client. x-forwarded-for is only read off Vercel (local dev / next start), where nothing is trusted anyway.
 */
export function clientIp(request: Request, env: Record<string, string | undefined> = process.env) {
  const h = request.headers;
  const trusted = firstIp(h.get("x-vercel-forwarded-for")) || firstIp(h.get("x-real-ip"));
  if (trusted) return trusted;
  if (!env.VERCEL) return firstIp(h.get("x-forwarded-for")) || "unknown";
  return "unknown";
}

/** True when this key is over `limit` calls in the last `windowMs` (this instance only). */
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function sharedStore(env: Record<string, string | undefined> = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "";
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "";
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/**
 * Same as rateLimited, but counted across all instances when a shared store is configured.
 * Falls back to the in-memory count when the store is not set up or does not answer in time.
 */
export async function rateLimitedShared(key: string, limit: number, windowMs: number, opts: { env?: Record<string, string | undefined>; fetcher?: typeof fetch } = {}) {
  const store = sharedStore(opts.env);
  if (!store) return rateLimited(key, limit, windowMs);
  const bucket = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
  try {
    const res = await (opts.fetcher || fetch)(`${store.url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${store.token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", bucket], ["PEXPIRE", bucket, String(windowMs)]]),
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("store");
    const out = (await res.json()) as { result?: unknown }[];
    const count = Number(out?.[0]?.result);
    if (!Number.isFinite(count)) throw new Error("store");
    return count > limit;
  } catch {
    return rateLimited(key, limit, windowMs);
  }
}

export const tooMany = () => Response.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429, headers: { "retry-after": "60" } });
