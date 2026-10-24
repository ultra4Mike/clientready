import { serviceClient } from "@/lib/stripe-server";
import { clientIp, rateLimitedShared, tooMany } from "@/lib/rate-limit";
import { BOOKING_RPC_ERRORS, bookingError, servicesFrom, validOwnerKey } from "@/lib/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?owner=slug|id: business name + services (only when the owner turned booking on). */
export async function GET(request: Request) {
  if (await rateLimitedShared(`book-page:${clientIp(request)}`, 60, 60_000)) return tooMany();
  const owner = new URL(request.url).searchParams.get("owner") || "";
  if (!validOwnerKey(owner)) return Response.json({ error: BOOKING_RPC_ERRORS.not_found }, { status: 404 });
  const { data, error } = await serviceClient().rpc("get_booking_page", { p_owner: owner });
  if (error || !data) return Response.json({ error: BOOKING_RPC_ERRORS.not_found }, { status: 404 });
  const row = data as { business?: string; services?: unknown };
  return Response.json({ business: String(row.business || ""), services: servicesFrom(row.services) });
}

/** POST { owner, ...form }: honeypot + IP rate limit here, then the security-definer RPC does the insert. */
export async function POST(request: Request) {
  if (await rateLimitedShared(`book:${clientIp(request)}`, 5, 10 * 60_000)) return tooMany();
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_600_000) return Response.json({ error: BOOKING_RPC_ERRORS.photos }, { status: 413 });
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { body = {}; }
  const owner = String(body.owner || "");
  if (!validOwnerKey(owner)) return Response.json({ error: BOOKING_RPC_ERRORS.not_found }, { status: 404 });
  // Honeypot: bots fill the hidden "website" field. Answer like a success so they don't retry.
  if (String(body.website || "").trim()) return Response.json({ ok: true });
  const s = (k: string) => String(body[k] ?? "");
  const payload = {
    name: s("name"), phone: s("phone"), email: s("email"), address: s("address"), service: s("service"),
    preferred: s("preferred"), note: s("note"), photos: Array.isArray(body.photos) ? body.photos.slice(0, 3).map(String) : [],
  };
  // QA3: same checks as the form, so an empty or hand-made POST can't create a blank request.
  const problem = bookingError({ ...payload, website: "" } as never);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const { data, error } = await serviceClient().rpc("submit_booking_request", { p_owner: owner, p: payload });
  if (error) return Response.json({ error: "Could not send your request. Please try again." }, { status: 500 });
  const result = (data || {}) as { ok?: boolean; error?: string };
  if (!result.ok) return Response.json({ error: BOOKING_RPC_ERRORS[result.error || ""] || "Could not send your request." }, { status: result.error === "rate" ? 429 : result.error === "not_found" ? 404 : 400 });
  return Response.json({ ok: true });
}
