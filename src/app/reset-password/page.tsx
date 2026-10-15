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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input type="password" required placeholder="New password" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-white">
          {busy ? "Saving" : "Save password"}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
    </main>
  );
}