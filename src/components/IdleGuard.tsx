"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearLocalBusiness } from "@/lib/account-cache";
import { ACTIVITY_KEY, IDLE_KEY, PENDING_KEY, ROLE_KEY, dropStoredSession, idleMinutes, idleState, touchActivity } from "@/lib/session-policy";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/** Part 3: idle auto sign-out with a 1-minute warning, shared by every tab through localStorage. */
export default function IdleGuard() {
  const [signedIn, setSignedIn] = useState(false);
  const [warnLeft, setWarnLeft] = useState(0);
  const lastWrite = useRef(0);
  const leaving = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session))).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const limit = () => idleMinutes(window.localStorage.getItem(IDLE_KEY), window.localStorage.getItem(ROLE_KEY));
    if (!window.localStorage.getItem(ACTIVITY_KEY)) touchActivity();
    async function leave() {
      if (leaving.current) return;
      leaving.current = true;
      dropStoredSession("idle");
      try { clearLocalBusiness(); } catch { /* best effort */ }
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      window.localStorage.removeItem(PENDING_KEY);
      window.location.replace("/login?reason=idle");
    }
    function check() {
      const s = idleState(Date.now(), Number(window.localStorage.getItem(ACTIVITY_KEY) || 0), limit());
      if (s.state === "expired") void leave();
      setWarnLeft(s.state === "warn" ? Math.ceil(s.remainingMs / 1000) : 0);
    }
    function onActivity() {
      const now = Date.now();
      if (now - lastWrite.current < 10_000) return; // throttle writes
      lastWrite.current = now;
      touchActivity(now);
      check();
    }
    function onStorage(event: StorageEvent) {
      if (event.key === PENDING_KEY && event.newValue === "idle") { leaving.current = true; window.location.replace("/login?reason=idle"); return; }
      if (event.key === ACTIVITY_KEY || event.key === IDLE_KEY) check();
    }
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true, capture: true }));
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 1000);
    check();
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity, { capture: true }));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [signedIn]);

  if (!warnLeft) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Signing out soon" data-testid="idle-warning" className="fixed inset-x-3 top-3 z-[300] mx-auto max-w-md rounded-xl border border-amber-400 bg-[var(--cr-card)] p-4 text-sm shadow-xl">
      <p className="font-semibold">Still there?</p>
      <p className="mt-1">For safety you&apos;ll be signed out in {warnLeft} second{warnLeft === 1 ? "" : "s"}.</p>
      <button type="button" data-testid="idle-stay" onClick={() => { lastWrite.current = Date.now(); touchActivity(); setWarnLeft(0); }} className="mt-3 min-h-11 w-full rounded-lg bg-teal-500 font-semibold text-slate-950!">Stay signed in</button>
    </div>
  );
}
