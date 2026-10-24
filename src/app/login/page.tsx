"use client";

import { friendlyError } from "@/lib/net-error";
import { linkOrigin } from "@/lib/site";
import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { afterAuthPath, pendingPlan, usePlanFromUrl } from "@/lib/pending-plan";
import BrandMark from "@/components/BrandMark";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkeys";
import { keepDefault, loginReasonMessage, markSignedIn, ROLE_KEY } from "@/lib/session-policy";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unconfirmed, setUnconfirmed] = useState("");
  const [resent, setResent] = useState("");
  async function resendConfirmation() {
    const { error } = await supabase.auth.resend({ type: "signup", email: unconfirmed, options: { emailRedirectTo: `${linkOrigin()}/auth/callback` } });
    setResent(error ? `Could not resend: ${friendlyError(error.message)}` : `Sent a new link to ${unconfirmed}. Check inbox and spam.`);
  }
  const [message, setMessage] = useState("");
  // Part 3: "Keep me signed in" (unchecked for owners, checked for crew who logged in here before).
  const [keep, setKeep] = useState(false);
  const [reasonNote, setReasonNote] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    setKeep(keepDefault(window.localStorage.getItem(ROLE_KEY)));
    setReasonNote(loginReasonMessage(new URLSearchParams(window.location.search).get("reason")));
  }, []);
  const [busy, setBusy] = useState(false);
  const canPasskey = useSyncExternalStore(noSubscribe, () => passkeysSupported(window), () => false);
  async function passkeyLogin() {
    setBusy(true); setMessage("");
    const r = await signInWithPasskey();
    if (!r.ok) { setBusy(false); setMessage(r.message); return; }
    await finishSignIn();
  }
  const [resetMode, setResetMode] = useState(false);
  // ?plan= (or a plan picked before an email-confirmation round trip): checkout opens after logging in.
  const plan = usePlanFromUrl();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (resetMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${linkOrigin()}/reset-password`,
      });
      setBusy(false);
      setMessage(error ? friendlyError(error.message) : "Reset link sent. Check inbox and spam.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      setBusy(false);
      // R94: unconfirmed account -> friendly note + Resend button (not a raw error).
      if (/not confirmed/i.test(error.message || "") || (error as { code?: string }).code === "email_not_confirmed") {
        setUnconfirmed(cleanEmail);
        setMessage("");
        return;
      }
      setMessage(friendlyError(error.message));
      return;
    }
    await finishSignIn();
  }

  /** Shared by password and passkey sign-in: crew vs owner routing + the keep/idle policy. */
  async function finishSignIn() {
    const { data: session } = await supabase.auth.getUser();
    const signedIn = session.user;
    if (signedIn) {
      const { data: person } = await supabase.rpc("is_crew_email");
      const row = Array.isArray(person) ? person[0] : person;
      if (row && row.user_id && row.user_id !== signedIn.id) {
        markSignedIn(keep, "crew");
        window.location.href = "/crew";
        return;
      }
    }
    markSignedIn(keep, "owner");
    await loadAccountIntoCache();
    window.location.href = afterAuthPath(plan || pendingPlan());
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4 py-10">
      <div className="w-full max-w-md">
      <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600"><BrandMark className="h-7 w-7" />Back to ClientReady</Link>
      <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 shadow-xl shadow-teal-950/10 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{resetMode ? "Reset password" : "Log in"}</h1>
      {reasonNote && <p role="status" data-testid="login-reason" className="mt-4 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm">{reasonNote}</p>}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input type="email" required placeholder="Email" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={email} onChange={(event) => setEmail(event.target.value)} />
        {!resetMode && (
          <input type="password" required placeholder="Password" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={password} onChange={(event) => setPassword(event.target.value)} />
        )}
        {!resetMode && (
          <label className="flex min-h-11 items-center gap-2.5 text-sm" data-testid="login-keep">
            <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} className="h-5 w-5 accent-teal-500" />
            <span>Keep me signed in on this device <span className="block text-xs text-[var(--cr-muted)]">Leave unticked on shared or public computers.</span></span>
          </label>
        )}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60">
          {busy ? "Working" : resetMode ? "Send reset link" : "Log in"}
        </button>
      </form>
      {canPasskey && !resetMode && (
        <button type="button" data-testid="login-passkey" disabled={busy} onClick={passkeyLogin} className="mt-3 min-h-11 w-full rounded-lg border border-teal-500/40 px-4 py-2.5 text-sm font-semibold transition hover:bg-teal-500/10 disabled:opacity-60">
          Sign in with fingerprint or face
        </button>
      )}
      {unconfirmed && (
        <div role="status" className="mt-4 space-y-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-3 text-sm" data-testid="login-unconfirmed">
          <p>Almost there: confirm your email first. Tap the link we sent to <strong>{unconfirmed}</strong>.</p>
          <button type="button" data-testid="login-resend" onClick={resendConfirmation} className="min-h-11 rounded-lg border border-teal-500/40 px-3 font-medium">Resend confirmation</button>
          {resent && <p data-testid="login-resent">{resent}</p>}
        </div>
      )}
      {message && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{message}</p>}
      <button type="button" onClick={() => { setResetMode(!resetMode); setMessage(""); }} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600">
        {resetMode ? "Back to log in" : "Forgot password?"}
      </button>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--cr-muted)]">
        New here? <a href={plan ? `/signup?plan=${plan}` : "/signup"} className="font-semibold text-teal-600 hover:underline">Create an account</a>
      </p>
      <LegalLinks className="mt-4 text-center" />
      </div>
    </main>
  );
}