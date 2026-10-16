"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      setMessage("Use at least 6 characters.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4 py-10">
      <div className="w-full max-w-md">
      <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 shadow-xl shadow-teal-950/10 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input type="password" required placeholder="New password" className="w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base shadow-sm sm:text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-60">
          {busy ? "Saving" : "Save password"}
        </button>
      </form>
      {message && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{message}</p>}
      </div>
      </div>
    </main>
  );
}