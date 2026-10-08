"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("clientready-theme") || "dark";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
    document.documentElement.classList.toggle("light", saved === "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("clientready-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  return (
    <main className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <header className="border-b border-teal-500/20 bg-[var(--cr-panel)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-sm font-bold text-slate-950">
              C
            </span>
            ClientReady
          </a>
          <div className="flex items-center gap-4 text-sm">
            <button type="button" onClick={toggleTheme} className="hidden sm:inline">
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <a href="/login" className="hidden sm:inline">Log in</a>
            <a href="/signup" className="rounded-lg bg-teal-400 px-4 py-2 font-medium text-slate-950">
              Start free
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-teal-400">For one-person businesses</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight md:text-5xl">
            Get paid. Stay client-ready.
          </h1>
          <p className="mt-4 max-w-xl text-[var(--cr-muted)]">
            Write the proposal, send the invoice, mark it paid, and keep a year log.
            No blank page. No card required to start.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/signup" className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-medium text-slate-950">
              Start free
            </a>
            <a href="#pricing" className="rounded-lg border border-teal-400/40 px-5 py-3 text-sm">
              See pricing
            </a>
          </div>
        </div>

        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sample invoice</p>
          <div className="mt-2 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold">INV-1042</h2>
              <p className="mt-2 text-sm text-slate-600">North Yard Co.</p>
              <p className="text-sm text-slate-600">Bill to: Lena Ortiz</p>
            </div>
            <div className="text-right text-sm text-slate-600">
              <p>Date: 2026-10-01</p>
              <p>Due: 2026-10-15</p>
            </div>
          </div>
          <div className="mt-6 flex justify-between border-t border-slate-200 pt-3 text-sm">
            <span>Fall cleanup</span>
            <span>$240.00</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span>Haul away</span>
            <span>$80.00</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 font-semibold">
            <span>Total</span>
            <span>$320.00</span>
          </div>
          <p className="mt-4 text-sm text-slate-600">Pay here: Venmo @northyard</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Proposals</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Scope, price, and your costs. The customer copy stays clean.</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Invoices</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Dates, line items, and a pay line from your profile.</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Year packet</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Paid invoices and job costs in one log for your preparer.</p>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-2xl font-semibold">Simple pricing</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-[var(--cr-muted)]">Start</p>
            <p className="mt-2 text-3xl font-semibold">Free</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">3 documents. No card.</p>
          </div>
          <div className="rounded-2xl border border-teal-400 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-teal-400">Monthly</p>
            <p className="mt-2 text-3xl font-semibold">$7.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">After the 3 free documents. Checkout comes later.</p>
          </div>
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-[var(--cr-muted)]">3 months</p>
            <p className="mt-2 text-3xl font-semibold">$19.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">Same tools, paid ahead. Checkout comes later.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-teal-500/20 px-4 py-6 text-center text-sm text-[var(--cr-muted)]">
        <a href="/login" className="px-3 sm:hidden">Log in</a>
        <a href="/privacy" className="px-3">Privacy</a>
        <a href="/terms" className="px-3">Terms</a>
      </footer>
    </main>
  );
}