/** Which accounting connections are set up (app keys present) — no secrets returned. */
import { INTEGRATIONS } from "@/lib/flags";
import { PROVIDERS, providerConfig } from "@/lib/integrations/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!INTEGRATIONS) return Response.json({ enabled: false });
  const serviceReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return Response.json({ enabled: true, providers: Object.fromEntries(PROVIDERS.map((p) => [p, serviceReady && Boolean(providerConfig(p).clientId && providerConfig(p).clientSecret)])) });
}
