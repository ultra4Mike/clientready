"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("clientready-theme") || "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("clientready-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <header className="border-b border-teal-500/20 bg-[var(--cr-panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-slate-950">
              C
            </span>
            ClientReady
          </a>
          <div className="flex items-center gap-4 text-sm">
            <button type="button" onClick={toggleTheme}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <a href="/login">Log in</a>
            <a
              href="/signup"
              className="rounded-lg bg-teal-400 px-4 py-2 font-medium text-slate-950"
            >
              Start free
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-sm uppercase tracking-wide text-teal-400">
          Client documents and job tracking
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          Get paid. Stay client-ready.
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--cr-muted)]">
          Build proposals, invoices, emails, and reports, then track jobs and
          collections without a blank page.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/signup"
            className="inline-flex rounded-lg bg-teal-400 px-5 py-3 text-sm font-medium text-slate-950"
          >
            Start free
          </a>
          <a
            href="#pricing"
            className="inline-flex rounded-lg border border-teal-400/40 px-5 py-3 text-sm"
          >
            See pricing
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Proposals</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">
            Scope, timeline, and price in one page.
          </p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Invoices</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">
            Numbered invoices with paid and overdue status.
          </p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Emails</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">
            Follow-ups you can copy and send.
          </p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Reports</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">
            Simple status reports after the job.
          </p>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
          <h2 className="text-xl font-semibold">Simple pricing</h2>
          <p className="mt-2 text-[var(--cr-muted)]">
            3 free documents. Then $7.99 a month or $19.99 for 3 months.
          </p>
        </div>
      </section>

      <footer className="border-t border-teal-500/20 px-4 py-6 text-center text-sm text-[var(--cr-muted)]">
        <a href="/privacy" className="px-3">Privacy</a>
        <a href="/terms" className="px-3">Terms</a>
      </footer>
    </main>
  );
}