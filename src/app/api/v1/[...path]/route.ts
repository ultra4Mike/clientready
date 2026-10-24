/**
 * Backlog 15: optional REST API (off by default; Settings > Integrations). Every request runs through the
 * database function api_call(), which checks the key (hashed), the account switch, the key's scopes, the
 * per-key rate limit (60/min), and only reads or writes that owner's rows. Docs: /developers.
 *   GET    /api/v1/clients | /api/v1/clients/:id         POST /api/v1/clients      PATCH /api/v1/clients/:id
 *   GET    /api/v1/jobs    | /api/v1/jobs/:id            PATCH /api/v1/jobs/:id    POST /api/v1/jobs/:id/notes
 *   GET    /api/v1/invoices| /api/v1/invoices/:id        POST /api/v1/invoices     PATCH /api/v1/invoices/:id
 *   GET    /api/v1/events?since=ISO-time
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { itemsError, validSince } from "@/lib/api-validate";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
const RESOURCES = new Set(["clients", "jobs", "invoices", "events"]);

/** Caller IP for the bad-key limit (first x-forwarded-for hop set by the host). */
function callerIp(request: Request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
}

async function handle(request: Request, path: string[], method: "GET" | "POST" | "PATCH") {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !anonKey) return fail(503, "The API isn't available right now.");
  const key = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^cr_[0-9a-f]{64}$/.test(key)) return fail(401, "Send your API key as: Authorization: Bearer cr_...");
  const [resource, id = "", sub = "", extra] = path;
  if (!RESOURCES.has(resource) || extra !== undefined || (sub && !(resource === "jobs" && sub === "notes"))) return fail(404, "Unknown endpoint. See /developers.");
  if (id && !/^[A-Za-z0-9-]{1,64}$/.test(id)) return fail(404, "Not found.");
  let action = "";
  let res = resource;
  if (resource === "events") action = method === "GET" && !id ? "list" : "";
  else if (sub === "notes") { action = method === "POST" ? "create" : ""; res = "notes"; }
  else if (method === "GET") action = id ? "get" : "list";
  else if (method === "POST" && !id && resource !== "jobs") action = "create";
  else if (method === "PATCH" && id) action = "update";
  if (!action) return fail(405, "Method not allowed for this endpoint.");

  let body: Record<string, unknown> = {};
  if (method !== "GET") {
    const text = await request.text();
    if (text.length > 100000) return fail(413, "Body too large.");
    try { body = text ? JSON.parse(text) : {}; } catch { return fail(400, "Body must be JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Body must be a JSON object.");
    const bad = resource === "invoices" ? itemsError(body.items) : "";
    if (bad) return fail(400, bad);
  } else if (resource === "events") {
    const since = new URL(request.url).searchParams.get("since") || "";
    if (since && !validSince(since)) return fail(400, "since must be an ISO date or time, like 2026-10-24T08:00:00Z.");
    if (since) body = { since };
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/api_call`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
    body: JSON.stringify({ p_key: key, p_resource: res, p_action: action, p_id: id || null, p_body: body, p_ip: callerIp(request) }),
  }).catch(() => null);
  if (!response?.ok) return fail(502, "The API could not reach the database. Try again.");
  const result = (await response.json().catch(() => null)) as { status?: number; data?: unknown; error?: string } | null;
  if (!result?.status) return fail(502, "Unexpected response.");
  if (result.status >= 400) return fail(result.status, result.error || "Request failed.");
  return Response.json({ data: result.data }, { status: result.status, headers: { "cache-control": "no-store" } });
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, ctx: Ctx) { return handle(request, (await ctx.params).path, "GET"); }
export async function POST(request: Request, ctx: Ctx) { return handle(request, (await ctx.params).path, "POST"); }
export async function PATCH(request: Request, ctx: Ctx) { return handle(request, (await ctx.params).path, "PATCH"); }
