"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** R72: worker keys only see that worker's own jobs and can add notes to them. */
const WORKER_SCOPES: string[] = ["jobs:read", "notes:write"];
const SCOPES = [
  ["clients:read", "Read clients"], ["clients:write", "Add/edit clients"], ["jobs:read", "Read jobs"], ["jobs:write", "Update job status/date"],
  ["invoices:read", "Read invoices"], ["invoices:write", "Create draft invoices"], ["notes:write", "Add visit notes"],
] as const;
type Key = { id: string; name: string; prefix: string; scopes: string[]; no_prices: boolean; created_at: string; last_used_at: string | null; revoked_at: string | null };

/** Backlog 15: optional API. Off by default; keys are created by the owner, scoped, shown once. */
export default function ApiSettings() {
  const [signedIn, setSignedIn] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["clients:read"]);
  const [worker, setWorker] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [people] = useState<{ id: string; name: string }[]>(() => {
    try { return typeof window === "undefined" ? [] : (JSON.parse(window.localStorage.getItem("clientready-employees") || "[]") as { id: string; name: string; active?: boolean }[]).filter((p) => p && p.id && p.active !== false); } catch { return []; }
  });
  const [created, setCreated] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    setSignedIn(true);
    const profile = await supabase.from("profiles").select("api_enabled").eq("id", data.user.id).maybeSingle();
    if (profile.error) { setMessage("Integrations need an account update (migration 20261022090000)."); return; }
    setEnabled(Boolean((profile.data as { api_enabled?: boolean } | null)?.api_enabled));
    const list = await supabase.from("api_keys").select("id,name,prefix,scopes,no_prices,created_at,last_used_at,revoked_at").is("revoked_at", null).order("created_at", { ascending: false });
    setKeys((list.data as Key[]) || []);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function toggle(on: boolean) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { error } = await supabase.from("profiles").update({ api_enabled: on }).eq("id", data.user.id);
    if (error) setMessage(`Not saved: ${error.message}`); else { setEnabled(on); setMessage(on ? "API on. Create a key below." : "API off. Keys stop working until you turn it back on."); }
  }
  async function create() {
    setCreated("");
    const chosen = worker ? scopes.filter((s) => WORKER_SCOPES.includes(s)) : scopes;
    if (!chosen.length) { setMessage(worker ? "A worker key can read their jobs and/or add notes to them." : "Pick at least one permission."); return; }
    if (worker && !workerId) { setMessage("Pick which worker this key is for."); return; }
    const { data, error } = await supabase.rpc("api_create_key", { p_name: name.trim() || "API key", p_scopes: chosen, p_no_prices: worker, ...(worker ? { p_employee_id: workerId } : {}) });
    if (error) { setMessage(`Key not created: ${error.message}`); return; }
    setCreated(String(data || "")); setName(""); setMessage("Copy this key now. It won't be shown again."); void load();
  }
  async function revoke(id: string) {
    const { error } = await supabase.rpc("api_revoke_key", { p_id: id });
    setMessage(error ? `Not revoked: ${error.message}` : "Key revoked."); void load();
  }

  if (!signedIn) return <p className="text-sm text-[var(--cr-muted)]" data-testid="api-settings">Sign in to use Integrations.</p>;
  return (
    <div className="space-y-3" data-testid="api-settings" data-enabled={enabled}>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input type="checkbox" name="apiEnabled" data-testid="api-enabled" className="mt-1 h-5 w-5 accent-teal-600" checked={enabled} onChange={(e) => void toggle(e.target.checked)} />
        <span>Turn on the API (for Zapier, Make or your own tools). Off by default. <a href="/developers" className="underline" data-testid="api-docs-link">How it works</a></span>
      </label>
      {enabled && (
        <div className="space-y-2 rounded-lg border border-teal-500/20 p-3">
          <input name="apiKeyName" data-testid="api-key-name" aria-label="Key name" placeholder="Key name (e.g. Zapier)" value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm" />
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SCOPES.map(([value, label]) => {
              const blocked = worker && !WORKER_SCOPES.includes(value);
              return (
                <label key={value} className={`flex min-h-11 items-center gap-2 text-sm ${blocked ? "opacity-50" : ""}`}>
                  <input type="checkbox" name={`scope-${value}`} data-testid={`api-scope-${value.replace(":", "-")}`} disabled={blocked} className="h-5 w-5 accent-teal-600" checked={!blocked && scopes.includes(value)} onChange={(e) => setScopes(e.target.checked ? [...scopes, value] : scopes.filter((s) => s !== value))} />
                  {label}
                </label>
              );
            })}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="apiWorker" data-testid="api-worker" className="h-5 w-5 accent-teal-600" checked={worker} onChange={(e) => setWorker(e.target.checked)} />
            Worker key: only that worker&apos;s own jobs, no prices, no other clients
          </label>
          {worker && (
            <select aria-label="Worker for this key" data-testid="api-worker-employee" value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm">
              <option value="">Which worker?</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          )}
          <button type="button" data-testid="api-key-create" onClick={() => void create()} className="min-h-11 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white">Create key</button>
          {created && <p className="break-all rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-900" data-testid="api-key-created">{created}</p>}
          <ul className="divide-y divide-slate-200 text-sm" data-testid="api-keys">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-2 py-2" data-testid="api-key">
                <span className="min-w-0"><span className="font-medium">{key.name}</span> <span className="font-mono text-xs">{key.prefix}…</span>{key.no_prices && <span className="ml-1 text-xs">(worker)</span>}<br /><span className="text-xs text-[var(--cr-muted)]">{key.scopes.join(", ")}{key.last_used_at ? ` · last used ${new Date(key.last_used_at).toLocaleDateString()}` : " · never used"}</span></span>
                <button type="button" data-testid="api-key-revoke" onClick={() => void revoke(key.id)} className="min-h-11 shrink-0 rounded-lg border border-rose-400 px-3 text-xs text-rose-700">Revoke</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && <p className="text-xs" data-testid="api-message" role="status">{message}</p>}
    </div>
  );
}
