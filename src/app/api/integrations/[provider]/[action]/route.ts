/**
 * QuickBooks Online / Xero (behind NEXT_PUBLIC_FLAG_INTEGRATIONS and the provider app keys in env).
 *   POST connect    (owner Bearer) -> { url } to the provider's consent page
 *   GET  callback   (provider redirect with code + one-time state) -> saves tokens server-side, back to /integrations
 *   POST sync       (owner Bearer) -> one-way create-only push of clients, invoices, payments
 *   POST disconnect (owner Bearer) -> forgets the tokens (links are kept so a reconnect doesn't duplicate)
 */
import { INTEGRATIONS } from "@/lib/flags";
import { authorizeUrl, PROVIDERS, providerConfig, type Provider } from "@/lib/integrations/providers";
import { exchangeCode, newState, ownerFromRequest, redirectUri, runSync, saveConnection, service, siteUrl, supabaseEnv, takeState, xeroTenant } from "@/lib/integrations/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
type Ctx = { params: Promise<{ provider: string; action: string }> };

function ready(provider: string): Provider | null {
  if (!INTEGRATIONS || !PROVIDERS.includes(provider as Provider)) return null;
  const { url, serviceKey } = supabaseEnv();
  return providerConfig(provider as Provider).clientId && url && serviceKey ? (provider as Provider) : null;
}

export async function POST(request: Request, ctx: Ctx) {
  const { provider: raw, action } = await ctx.params;
  if (!INTEGRATIONS) return fail(404, "Not found.");
  const provider = ready(raw);
  if (!provider) return fail(503, "This connection isn't set up yet.");
  const owner = await ownerFromRequest(request);
  if (!owner) return fail(401, "Sign in first.");
  if (action === "connect") {
    const state = await newState(owner.id, provider);
    if (!state) return fail(503, "Could not start the connection. Has the integrations migration run?");
    return Response.json({ url: authorizeUrl(provider, providerConfig(provider), redirectUri(request, provider), state) });
  }
  if (action === "sync") return Response.json({ result: await runSync(owner.id, owner.token, provider) });
  if (action === "disconnect") {
    const response = await service(`integration_connections?owner_id=eq.${owner.id}&provider=eq.${provider}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
    return response?.ok ? Response.json({ ok: true }) : fail(502, "Could not disconnect. Try again.");
  }
  return fail(404, "Not found.");
}

export async function GET(request: Request, ctx: Ctx) {
  const { provider: raw, action } = await ctx.params;
  const provider = ready(raw);
  const back = (status: string) => Response.redirect(`${siteUrl(request)}/integrations?${raw}=${status}`, 302);
  if (!provider || action !== "callback") return INTEGRATIONS ? back("unavailable") : fail(404, "Not found.");
  const params = new URL(request.url).searchParams;
  const ownerId = await takeState(params.get("state") || "", provider);
  if (!ownerId) return back("expired");
  if (params.get("error")) return back("declined");
  const tokens = await exchangeCode(provider, params.get("code") || "", redirectUri(request, provider));
  if (!tokens) return back("failed");
  let external = { id: params.get("realmId") || "", name: "" };
  if (provider === "xero") external = (await xeroTenant(tokens.access_token)) || { id: "", name: "" };
  if (!external.id) return back("failed");
  return back((await saveConnection(ownerId, provider, external.id, external.name, tokens)) ? "connected" : "failed");
}
