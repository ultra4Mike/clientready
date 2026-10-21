/** Server only. Integration storage (service role), OAuth token exchange/refresh, and the one-way sync. */
import { randomBytes } from "crypto";
import {
  invoicePayments, providerConfig, qboCustomer, qboInvoice, qboPayment, shouldSync, xeroContact, xeroInvoice, xeroPayment,
  type LocalClient, type LocalInvoice, type Provider,
} from "@/lib/integrations/providers";

export function supabaseEnv() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return { url, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "", serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "" };
}

/** The signed-in owner from a Bearer token (verified by Supabase), or null. */
export async function ownerFromRequest(request: Request) {
  const { url, anonKey } = supabaseEnv();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !token) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } }).catch(() => null);
  if (!response?.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: string } | null;
  return user?.id ? { id: user.id, token } : null;
}

/** Service-role REST call (integration tables only ever touched here). */
export async function service(path: string, init: RequestInit = {}) {
  const { url, serviceKey } = supabaseEnv();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) },
  }).catch(() => null);
}

export function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
}
export const redirectUri = (request: Request, provider: Provider) => `${siteUrl(request)}/api/integrations/${provider}/callback`;

export async function newState(ownerId: string, provider: Provider) {
  const state = randomBytes(24).toString("hex");
  await service("integration_states?created_at=lt." + encodeURIComponent(new Date(Date.now() - 3600_000).toISOString()), { method: "DELETE" });
  const response = await service("integration_states", { method: "POST", body: JSON.stringify({ state, owner_id: ownerId, provider }) });
  return response?.ok ? state : "";
}

/** One-time state lookup (10 minutes), deleted on use. */
export async function takeState(state: string, provider: Provider) {
  if (!/^[0-9a-f]{48}$/.test(state)) return "";
  const response = await service(`integration_states?state=eq.${state}&provider=eq.${provider}`, { method: "DELETE" });
  const rows = (response?.ok ? await response.json().catch(() => []) : []) as { owner_id: string; created_at: string }[];
  const row = rows[0];
  return row && Date.parse(row.created_at) > Date.now() - 600_000 ? row.owner_id : "";
}

type Tokens = { access_token: string; refresh_token: string; expires_in?: number };

async function tokenRequest(provider: Provider, body: Record<string, string>) {
  const config = providerConfig(provider);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  }).catch(() => null);
  if (!response?.ok) return null;
  const tokens = (await response.json().catch(() => null)) as Tokens | null;
  return tokens?.access_token ? tokens : null;
}

export async function exchangeCode(provider: Provider, code: string, redirect: string) {
  return tokenRequest(provider, { grant_type: "authorization_code", code, redirect_uri: redirect });
}

/** Xero: which organisation the tokens are for (first connection). */
export async function xeroTenant(accessToken: string) {
  const response = await fetch(providerConfig("xero").connectionsUrl!, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }).catch(() => null);
  const list = (response?.ok ? await response.json().catch(() => []) : []) as { tenantId?: string; tenantName?: string }[];
  return list[0]?.tenantId ? { id: list[0].tenantId, name: list[0].tenantName || "" } : null;
}

export async function saveConnection(ownerId: string, provider: Provider, externalId: string, externalName: string, tokens: Tokens) {
  const row = {
    owner_id: ownerId, provider, external_id: externalId, external_name: externalName, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + (tokens.expires_in || 1800) * 1000).toISOString(), connected_at: new Date().toISOString(),
  };
  const response = await service("integration_connections?on_conflict=owner_id,provider", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  return Boolean(response?.ok);
}

type Connection = { owner_id: string; provider: Provider; external_id: string; access_token: string; refresh_token: string; expires_at: string | null };

export async function loadConnection(ownerId: string, provider: Provider) {
  const response = await service(`integration_connections?owner_id=eq.${ownerId}&provider=eq.${provider}&select=*`);
  const rows = (response?.ok ? await response.json().catch(() => []) : []) as Connection[];
  return rows[0] || null;
}

async function freshToken(connection: Connection) {
  if (connection.expires_at && Date.parse(connection.expires_at) > Date.now() + 60_000) return connection.access_token;
  const tokens = await tokenRequest(connection.provider, { grant_type: "refresh_token", refresh_token: connection.refresh_token });
  if (!tokens) return "";
  await service(`integration_connections?owner_id=eq.${connection.owner_id}&provider=eq.${connection.provider}`, {
    method: "PATCH", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token || connection.refresh_token, expires_at: new Date(Date.now() + (tokens.expires_in || 1800) * 1000).toISOString() }),
  });
  return tokens.access_token;
}

type Link = { kind: string; local_id: string; remote_id: string };

/** Pushes what isn't there yet. Returns counts and the first few problems (never throws). */
export async function runSync(ownerId: string, userToken: string, provider: Provider) {
  const result = { clients: 0, invoices: 0, payments: 0, skipped: 0, errors: [] as string[] };
  const connection = await loadConnection(ownerId, provider);
  if (!connection) return { ...result, errors: ["Not connected."] };
  const access = await freshToken(connection);
  if (!access) return { ...result, errors: ["The connection expired. Connect again."] };
  const config = providerConfig(provider);
  const { url, anonKey } = supabaseEnv();
  const asOwner = (path: string) => fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anonKey, authorization: `Bearer ${userToken}` } }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const [clients, invoices, linkRows] = await Promise.all([
    asOwner("clients?select=id,name,email,phone,address,company") as Promise<LocalClient[]>,
    asOwner("documents?type=eq.invoice&select=id,title,client_name,data") as Promise<LocalInvoice[]>,
    service(`integration_links?owner_id=eq.${ownerId}&provider=eq.${provider}&select=kind,local_id,remote_id`).then((r) => (r?.ok ? r.json() : [])).catch(() => []) as Promise<Link[]>,
  ]);
  const links = new Map(linkRows.map((link) => [`${link.kind}:${link.local_id}`, link.remote_id]));
  const remember = async (kind: string, localId: string, remoteId: string) => {
    links.set(`${kind}:${localId}`, remoteId);
    await service("integration_links", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ owner_id: ownerId, provider, kind, local_id: localId, remote_id: remoteId }) });
  };
  const api = async (path: string, body: unknown) => {
    const target = provider === "quickbooks"
      ? `${config.apiBase}/v3/company/${connection.external_id}/${path}?minorversion=73`
      : `${config.apiBase}/api.xro/2.0/${path}`;
    const response = await fetch(target, {
      method: provider === "quickbooks" ? "POST" : "PUT",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json", accept: "application/json", ...(provider === "xero" ? { "xero-tenant-id": connection.external_id } : {}) },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = (response ? await response.json().catch(() => null) : null) as Record<string, unknown> | null;
    if (!response?.ok || !json) { if (result.errors.length < 5) result.errors.push(`${path}: ${response?.status || "network"}`); return null; }
    return json;
  };
  const clientKey = (name: string) => name.trim().toLowerCase();
  const byName = new Map(clients.map((client) => [clientKey(client.name), client]));
  const ensureClient = async (name: string) => {
    const local = byName.get(clientKey(name)) || { id: `name:${clientKey(name)}`, name };
    const known = links.get(`client:${local.id}`);
    if (known) return known;
    const json = provider === "quickbooks" ? await api("customer", qboCustomer(local)) : await api("Contacts", { Contacts: [xeroContact(local)] });
    const id = provider === "quickbooks" ? String((json?.Customer as { Id?: string } | undefined)?.Id || "") : String(((json?.Contacts as { ContactID?: string }[] | undefined) || [])[0]?.ContactID || "");
    if (!id) return "";
    result.clients++;
    await remember("client", local.id, id);
    return id;
  };
  for (const invoice of invoices) {
    if (!shouldSync(invoice)) { result.skipped++; continue; }
    const name = String(invoice.data.clientName || invoice.client_name || "").trim();
    if (!name) { result.skipped++; continue; }
    const customer = await ensureClient(name);
    if (!customer) continue;
    let remote = links.get(`invoice:${invoice.id}`) || "";
    if (!remote) {
      const json = provider === "quickbooks" ? await api("invoice", qboInvoice(invoice, customer, process.env.QBO_ITEM_ID || "1")) : await api("Invoices", { Invoices: [xeroInvoice(invoice, customer, process.env.XERO_SALES_ACCOUNT || "200")] });
      remote = provider === "quickbooks" ? String((json?.Invoice as { Id?: string } | undefined)?.Id || "") : String(((json?.Invoices as { InvoiceID?: string }[] | undefined) || [])[0]?.InvoiceID || "");
      if (!remote) continue;
      result.invoices++;
      await remember("invoice", invoice.id, remote);
    }
    for (const payment of invoicePayments(invoice)) {
      if (links.has(`payment:${payment.localId}`)) continue;
      const json = provider === "quickbooks" ? await api("payment", qboPayment(customer, remote, payment)) : await api("Payments", { Payments: [xeroPayment(remote, payment, process.env.XERO_PAYMENT_ACCOUNT || "090")] });
      const id = provider === "quickbooks" ? String((json?.Payment as { Id?: string } | undefined)?.Id || "") : String(((json?.Payments as { PaymentID?: string }[] | undefined) || [])[0]?.PaymentID || "");
      if (!id) continue;
      result.payments++;
      await remember("payment", payment.localId, id);
    }
  }
  await service(`integration_connections?owner_id=eq.${ownerId}&provider=eq.${provider}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ last_sync_at: new Date().toISOString(), last_sync_result: result }) });
  return result;
}
