"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }
    await loadAccountIntoCache();
    window.location.href = "/dashboard";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <a href="/" className="mb-8 text-sm text-slate-500">Back to ClientReady</a>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input type="email" required placeholder="Email" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
        <input type="password" required placeholder="Password" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
          {busy ? "Logging in" : "Log in"}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      <p className="mt-6 text-sm text-slate-600">
        New here? <a href="/signup" className="font-medium">Create an account</a>
      </p>
    </main>
  );
}