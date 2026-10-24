"use client";

import { useEffect, useState } from "react";
import { IDLE_CHOICES, IDLE_KEY, ROLE_KEY, idleChoiceLabel, idleMinutes, touchActivity } from "@/lib/session-policy";

/** Profile > Security: idle auto sign-out (synced to every tab through localStorage). */
export default function SecuritySettings({ children }: { children?: React.ReactNode }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setMinutes(idleMinutes(window.localStorage.getItem(IDLE_KEY), window.localStorage.getItem(ROLE_KEY)));
    read();
    const onStorage = (event: StorageEvent) => { if (event.key === IDLE_KEY) read(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  function pick(value: number) {
    setMinutes(value);
    try { window.localStorage.setItem(IDLE_KEY, String(value)); } catch { /* private mode */ }
    touchActivity();
  }
  return (
    <section id="security" className="scroll-mt-24 mt-6 space-y-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6" data-testid="settings-security">
      <h2 className="text-lg font-bold tracking-tight">Security</h2>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Sign out after no activity
        <select data-testid="idle-minutes" aria-label="Sign out after no activity" disabled={minutes === null} value={minutes ?? ""} onChange={(event) => pick(Number(event.target.value))} className="max-w-xs min-h-11 rounded-lg border border-teal-500/30 bg-transparent px-3 text-sm">
          {minutes === null && <option value="">Loading…</option>}
          {IDLE_CHOICES.map((m) => <option key={m} value={m}>{idleChoiceLabel(m)}</option>)}
        </select>
      </label>
      <p className="text-xs text-[var(--cr-muted)]">Applies on this device to every open tab. You get a 1-minute warning first. To stay signed in after closing the browser, tick &ldquo;Keep me signed in&rdquo; when you log in.</p>
      {children}
    </section>
  );
}
