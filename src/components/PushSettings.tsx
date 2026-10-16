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
        <p className="mt-1 text-sm text-[var(--cr-muted)]" data-testid="push-unavailable">Phone notifications aren&apos;t available yet on this device.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">Get a notification on this device for approvals, payments and crew updates.</p>
          <button type="button" disabled={busy || state === "loading"} onClick={toggle} className="mt-3 min-h-11 rounded-lg border border-teal-500/30 px-4 text-sm font-medium disabled:opacity-50" data-testid="push-toggle" aria-pressed={state === "on"}>
            {state === "on" ? "Turn off on this device" : "Turn on notifications"}
          </button>
        </>
      )}
      {message && <p role="status" className="mt-2 text-sm" data-testid="push-message">{message}</p>}
    </section>
  );
}
