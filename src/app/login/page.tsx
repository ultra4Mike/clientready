"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const cleanEmail = email.trim().toLowerCase();
    if (resetMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: "https://clientready-six.vercel.app/reset-password",
      });
      setBusy(false);
      setMessage(error ? error.message : "Reset link sent. Check inbox and spam.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      setBusy(false);
      setMessage(error.message);
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
    window.location.href = "/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4 py-10">
      <div className="w-full max-w-md">
      <Link href="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600"><span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-xs font-bold text-slate-950!">C</span>Back to ClientReady</Link>
      <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 shadow-xl shadow-teal-950/10 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{resetMode ? "Reset password" : "Log in"}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input type="email" required placeholder="Email" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={email} onChange={(event) => setEmail(event.target.value)} />
        {!resetMode && (
          <input type="password" required placeholder="Password" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={password} onChange={(event) => setPassword(event.target.value)} />
        )}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60">
          {busy ? "Working" : resetMode ? "Send reset link" : "Log in"}
        </button>
      </form>
      {message && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{message}</p>}
      <button type="button" onClick={() => { setResetMode(!resetMode); setMessage(""); }} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--cr-muted)] transition hover:text-teal-600">
        {resetMode ? "Back to log in" : "Forgot password?"}
      </button>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--cr-muted)]">
        New here? <a href="/signup" className="font-semibold text-teal-600 hover:underline">Create an account</a>
      </p>
      </div>
    </main>
  );
}