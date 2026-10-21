"use client";

import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { afterAuthPath, asPlan, usePlanFromUrl, rememberPlan } from "@/lib/pending-plan";
import { PLANS } from "@/lib/plans";
import { linkOrigin } from "@/lib/site";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // A plan chosen on the home / plans page: after the account exists, go straight to checkout.
  const plan = usePlanFromUrl();
  const planName = PLANS.find((item) => item.id === plan)?.name || "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    rememberPlan(asPlan(plan));
    const { data: created, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      // R94: the confirm link lands on /auth/callback, which sends crew to /crew and owners to the dashboard.
      options: { emailRedirectTo: `${linkOrigin()}/auth/callback${plan ? `?plan=${encodeURIComponent(plan)}` : ""}` },
    });
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }
    if (!created.session) {
      // Email confirmation is on: the plan stays on this device; logging in after confirming opens checkout.
      setBusy(false);
      setConfirm(true);
      return;
    }
    const { data: session } = await supabase.auth.getUser();
    const signedIn = session.user;
    if (signedIn) {
      const { data: person } = await supabase.rpc("is_crew_email");
      const row = Array.isArray(person) ? person[0] : person;
      if (row && row.user_id && row.user_id !== signedIn.id) {
        window.location.href = "/crew";
        return;
      }
    }
    await loadAccountIntoCache();
    window.location.href = afterAuthPath(asPlan(plan));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4 py-10">
      <div className="w-full max-w-md">
      <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-xs font-bold text-slate-950!">C</span>Back to ClientReady</Link>
      {confirm ? (
      <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 text-center shadow-xl shadow-teal-950/10 sm:p-8" data-testid="signup-check-email">
        <h1 className="text-2xl font-bold tracking-tight">Check your email to confirm</h1>
        <p className="mt-3 text-sm" data-testid="signup-confirm">We sent a link to <strong>{email.trim().toLowerCase()}</strong>. Tap it to finish. Crew go straight to their jobs; owners go to the dashboard.</p>
        <p className="mt-3 text-sm text-[var(--cr-muted)]">No email after a few minutes? Check spam, or <a href="/login" className="font-semibold text-teal-600 underline">log in</a> to resend it.</p>
      </div>
      ) : (
      <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 shadow-xl shadow-teal-950/10 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-[var(--cr-muted)]">14-day trial. No card to start. Crew use the email your boss saved.</p>
      {planName && <p className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-sm" data-testid="signup-plan" data-plan={plan}>Plan: <strong>{planName}</strong>. Create your account first; checkout opens next.</p>}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input type="email" required placeholder="Email" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input type="password" required minLength={6} placeholder="Password" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60">
          {busy ? "Creating account" : "Sign up"}
        </button>
        <LegalLinks prefix="By signing up you agree to the" className="text-center" />
      </form>
      {message && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{message}</p>}
      </div>
      )}
      <p className="mt-6 text-center text-sm text-[var(--cr-muted)]">
        Already have an account? <a href={plan ? `/login?plan=${plan}` : "/login"} data-testid="signup-login-link" className="font-semibold text-teal-600 hover:underline">Log in</a>
      </p>
      </div>
    </main>
  );
}