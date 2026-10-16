"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearOfflineCaches, wipeThisDevice } from "@/lib/wipe-device";

const box = "rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6";
const input = "mt-1.5 w-full min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 text-base outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 sm:text-sm";

/**
 * Account deletion, in the app and as the public web deletion URL (Google Play).
 * Signed in: type DELETE + re-enter password (or use an emailed sign-in link), then delete.
 * Signed out: we email a sign-in link to the address; nothing is deleted until it's opened.
 */
export default function DeleteAccountPage() {
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [freshLink, setFreshLink] = useState(false);

  useEffect(() => {
    // Arriving from the emailed link: the session in the URL was just issued.
    const fromLink = /access_token=|code=/.test(window.location.hash + window.location.search);
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setEmail(data.session?.user.email || "");
      setFreshLink(fromLink && Boolean(data.session));
    });
  }, []);

  async function sendLink(event?: FormEvent) {
    event?.preventDefault();
    setMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMessage("Enter the email you sign in with.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/account/delete` } });
    setBusy(false);
    // Same answer whether or not the address has an account.
    if (error && !/not found|signups not allowed/i.test(error.message)) return setMessage("Could not send the link. Try again in a minute.");
    setLinkSent(true);
  }

  async function remove(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (typed.trim() !== "DELETE") return setMessage("Type DELETE to confirm.");
    setBusy(true);
    let token = "";
    if (!freshLink) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        setBusy(false);
        return setMessage("Password is wrong. No password? Use “Email me a link instead”.");
      }
      token = data.session.access_token;
    } else {
      token = (await supabase.auth.getSession()).data.session?.access_token || "";
    }
    const response = await fetch("/api/account/delete", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) }).catch(() => null);
    const result = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!response?.ok) {
      setBusy(false);
      return setMessage(result?.error || "Could not delete. Check your connection and try again.");
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    wipeThisDevice();
    await clearOfflineCaches();
    window.location.href = "/?deleted=1";
  }

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <div className="mx-auto max-w-xl space-y-4 px-4 py-8 sm:px-6" data-testid="delete-account" data-state={signedIn === null ? "loading" : signedIn ? "signed-in" : "signed-out"}>
        <Link href={signedIn ? "/profile" : "/"} className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm text-[var(--cr-muted)]">← Back</Link>
        <div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-xl ring-1 ring-rose-500/30">⚠️</span><h1 className="text-2xl font-bold tracking-tight">Delete your ClientReady account</h1></div>
        <div className={box}>
          <p className="text-sm font-semibold">This permanently deletes:</p>
          <ul className="mt-3 space-y-2 text-sm [&>li]:flex [&>li]:gap-2 [&>li]:before:font-bold [&>li]:before:text-rose-500 [&>li]:before:content-['×']" data-testid="delete-what">
            <li>Your login and business profile, payment methods and settings</li>
            <li>All invoices, quotes, receipts, clients, photos and notes</li>
            <li>Crew list, schedules, time and expense records, ratings</li>
            <li>Approval links and client portals you shared (they stop working)</li>
          </ul>
          <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-800 dark:text-rose-200">It can&apos;t be undone. Crew members&apos; own logins are not deleted.</p>
          {signedIn && <Link href="/backup" className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-4 text-sm font-semibold text-teal-800 transition hover:border-teal-400 dark:text-teal-200 sm:w-auto" data-testid="delete-backup">Download a backup first</Link>}
        </div>

        {signedIn === false && (
          <form onSubmit={sendLink} className={box} data-testid="delete-request">
            {linkSent ? (
              <p role="status" data-testid="delete-link-sent">If that address has an account, we sent a link to it. Open it to finish deleting. Nothing is deleted until you do.</p>
            ) : (
              <>
                <label className="block text-sm font-medium">Email you sign in with<input type="email" className={input} data-testid="delete-email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
                <p className="mt-2 text-xs text-[var(--cr-muted)]">We&apos;ll email you a link to confirm it&apos;s you. Or <Link href="/login" className="text-teal-600 underline">sign in</Link> and come back here.</p>
                <button type="submit" disabled={busy} className="mt-4 min-h-11 w-full rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50 sm:w-auto" data-testid="delete-send-link">Email me a confirmation link</button>
              </>
            )}
            {message && <p role="alert" className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200" data-testid="delete-message">{message}</p>}
          </form>
        )}

        {signedIn && (
          <form onSubmit={remove} className={`${box} border-rose-500/50! ring-1 ring-rose-500/20`} data-testid="delete-confirm">
            <p className="text-sm">Signed in as <strong data-testid="delete-signed-in-as">{email}</strong></p>
            {!freshLink && (
              <label className="mt-3 block text-sm font-medium">Password<input type="password" className={input} data-testid="delete-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            )}
            {!freshLink && !linkSent && <button type="button" className="mt-1 min-h-11 text-sm text-teal-600 underline" data-testid="delete-use-link" onClick={() => sendLink()}>Email me a link instead</button>}
            {linkSent && <p role="status" className="mt-2 text-sm" data-testid="delete-link-sent">Link sent to {email}. Open it to finish.</p>}
            <label className="mt-3 block text-sm font-medium">Type DELETE to confirm<input className={input} data-testid="delete-type" value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters" autoComplete="off" /></label>
            {message && <p role="alert" className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200" data-testid="delete-message">{message}</p>}
            <button type="submit" disabled={busy || typed.trim() !== "DELETE"} className="mt-5 min-h-12 w-full rounded-lg bg-rose-600 px-4 text-base font-semibold text-white! shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50" data-testid="delete-submit">{busy ? "Deleting…" : "Delete my account"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
