"use client";

import { useEffect, useState } from "react";
import { deviceName, listPasskeys, passkeysSupported, registerPasskey, removePasskey } from "@/lib/passkeys";

type Item = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never");

/** Settings > Security: set up / list / remove fingerprint & face sign-in devices. */
export default function PasskeySettings() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() { const r = await listPasskeys(); setItems(r.items); setNote((prev) => r.message || (/didn.t work/.test(prev) ? "" : prev)); }
  useEffect(() => { setSupported(passkeysSupported(window)); void refresh(); }, []);
  async function add() {
    setBusy(true); setNote("");
    const r = await registerPasskey(deviceName(navigator.userAgent));
    setBusy(false);
    setNote(r.ok ? "Done. Next time, tap \u201cSign in with fingerprint or face\u201d on the login page." : r.message);
    await refresh();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Remove ${item.friendly_name || "this device"}? It won't be able to sign in with fingerprint or face.`)) return;
    const msg = await removePasskey(item.id); setNote(msg || "Removed."); await refresh();
  }
  return (
    <div className="mt-4 space-y-3 border-t border-teal-500/20 pt-4" data-testid="passkey-settings">
      <h3 className="text-sm font-semibold">Fingerprint / face sign-in</h3>
      {supported === false && <p className="text-xs text-[var(--cr-muted)]" data-testid="passkey-unsupported">This browser can&rsquo;t do fingerprint or face sign-in. Try your phone&rsquo;s Safari or Chrome.</p>}
      {supported && <button type="button" data-testid="passkey-add" disabled={busy} onClick={add} className="min-h-11 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! disabled:opacity-60">{busy ? "Waiting for your device…" : "Set up fingerprint / face sign-in"}</button>}
      {note && <p role="status" data-testid="passkey-note" className="text-sm">{note}</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-teal-500/15 rounded-lg border border-teal-500/20" data-testid="passkey-list">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-testid={`passkey-${item.id}`}>
              <span><span className="font-medium">{item.friendly_name || "Device"}</span><span className="block text-xs text-[var(--cr-muted)]">Added {when(item.created_at)} · last used {when(item.last_used_at)}</span></span>
              <button type="button" onClick={() => remove(item)} data-testid={`passkey-remove-${item.id}`} className="min-h-11 rounded-lg border border-red-500/40 px-3 text-red-600">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {items && items.length === 0 && <p className="text-xs text-[var(--cr-muted)]">No devices set up yet.</p>}
    </div>
  );
}
