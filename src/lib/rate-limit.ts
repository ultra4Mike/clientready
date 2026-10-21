/**
 * Best-effort per-instance rate limit (fixed window, in memory). Serverless instances don't share it,
 * so it slows abuse from one client rather than guaranteeing a global cap. Key by IP plus route.
 */
const hits = new Map<string, { count: number; reset: number }>();

export function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/** True when this key is over `limit` calls in the last `windowMs`. */
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

export const tooMany = () => Response.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429, headers: { "retry-after": "60" } });
