"use client";

import { useEffect, useState } from "react";
import { createPortal, portalStatus, portalUrl, revokePortal } from "@/lib/portal";

/** Owner controls for the client's portal link: make, copy, replace or turn off. */
export default function PortalShare({ clientName, clientId = "", compact = false }: { clientName: string; clientId?: string; compact?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<"checking" | "ok" | "signed-out" | "error">("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const name = clientName.trim();
  const client = { name, id: clientId || undefined };

  useEffect(() => {
    let live = true;
    if (name)
      portalStatus({ name, id: clientId || undefined }).then((found) => {
        if (!live) return;
        setToken(found.token);
        setCheckState(found.state);
      });
    return () => {
      live = false;
    };
  }, [name, clientId]);

  if (!name || name === "No client") return null;
  const link = token ? portalUrl(token) : "";

  async function make() {
    if (token && !window.confirm("Make a new portal link? The old link will stop working.")) return;
    setBusy(true);
    const result = await createPortal(client);
    setBusy(false);
    if (result.error) return setMessage(result.error);
    setToken(result.token);
    setCheckState("ok");
    setMessage("Portal link ready. Copy it and send it to your customer.");
  }

  async function revoke() {
    if (!window.confirm(`Turn off the portal link for ${name}? It will stop working right away.`)) return;
    setBusy(true);
    const error = await revokePortal(client);
    setBusy(false);
    if (error) return setMessage(error);
    setToken("");
    setMessage("Portal link turned off.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied");
    } catch {
      setMessage("Select the link and copy it.");
    }
  }

  return (
    <div className="print-hide space-y-2 rounded-lg border border-slate-300 p-3 text-sm" data-testid="portal-share" data-state={checkState}>
      <p className="font-semibold">Client portal for {name}</p>
      {!compact && <p className="text-xs text-slate-500">One link where {name} can see every sent invoice and proposal, approve, sign and pay. Drafts and your costs are never shown.</p>}
      {link && (
        <div className="flex flex-wrap gap-2">
          <input aria-label="Portal link" readOnly value={link} onFocus={(event) => event.target.select()} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
          <button type="button" onClick={copy} className="rounded-lg border border-slate-300 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Copy link</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || checkState === "checking" || checkState === "signed-out"} onClick={make} data-testid="portal-make" className="rounded-lg border border-slate-300 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">{token ? "New link" : "Share portal link"}</button>
        {token && <button type="button" disabled={busy} onClick={revoke} data-testid="portal-revoke" className="rounded-lg border border-slate-300 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Turn off link</button>}
      </div>
      {token === null && checkState === "signed-out" && <p className="text-xs text-slate-500">Sign in and save to your account to share a portal link.</p>}
      {token === null && checkState === "error" && <p className="text-xs text-slate-500" data-testid="portal-check-error">Could not check this client&apos;s portal link right now. You can still make a new one.</p>}
      {message && <p className="text-xs text-slate-500" data-testid="portal-message">{message}</p>}
    </div>
  );
}
