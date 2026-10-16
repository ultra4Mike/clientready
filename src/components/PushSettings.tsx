"use client";

import { useEffect, useState } from "react";
import { currentSubscription, disablePush, enablePush, pushConfigured, pushSupported } from "@/lib/push";

/** Settings: turn job/payment notifications on for this device. Inert until push is configured. */
export default function PushSettings() {
  const [state, setState] = useState<"loading" | "unavailable" | "off" | "on">("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushConfigured() || !pushSupported()) {
      Promise.resolve().then(() => setState("unavailable"));
      return;
    }
    currentSubscription().then((subscription) => setState(subscription ? "on" : "off")).catch(() => setState("off"));
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage("");
    if (state === "on") {
      await disablePush().catch(() => undefined);
      setState("off");
    } else {
      const error = await enablePush().catch(() => "Could not turn on notifications.");
      if (error) setMessage(error);
      else setState("on");
    }
    setBusy(false);
  }

  return (
    <section className="mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6" data-testid="push-settings" data-state={state}>
      <h2 className="text-lg font-bold tracking-tight">Notifications</h2>
      {state === "unavailable" ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-slate-500/10 px-3 py-2 text-sm text-[var(--cr-muted)]" data-testid="push-unavailable"><span aria-hidden="true">🔕</span>Phone notifications aren&apos;t available yet on this device.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">Get a notification on this device for approvals, payments and crew updates.</p>
          <button type="button" disabled={busy || state === "loading"} onClick={toggle} className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-teal-500/30 px-4 text-left text-sm font-medium transition hover:border-teal-400 disabled:opacity-50 sm:w-auto sm:min-w-80" data-testid="push-toggle" aria-pressed={state === "on"}>
            <span>{state === "on" ? "Turn off on this device" : "Turn on notifications"}</span>
            <span aria-hidden="true" className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${state === "on" ? "bg-teal-500" : "bg-slate-400/60"}`}><span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${state === "on" ? "left-6" : "left-1"}`} /></span>
          </button>
        </>
      )}
      {message && <p role="status" className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-sm text-[var(--cr-text)]" data-testid="push-message">{message}</p>}
    </section>
  );
}
