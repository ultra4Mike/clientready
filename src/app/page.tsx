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
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-sm font-bold text-slate-950">C</span>
            ClientReady
          </a>
          <div className="flex items-center gap-4 text-sm">
            <button type="button" onClick={toggleTheme} className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</button>
            <a href="/login" className="hidden sm:inline">Log in</a>
            <a href="/signup" className="rounded-lg bg-teal-400 px-4 py-2 font-medium text-slate-950">Start free</a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-sm uppercase tracking-wide text-teal-400">For small businesses</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">Get paid. Stay client-ready.</h1>
        <p className="mt-4 max-w-2xl text-[var(--cr-muted)]">
          The customer gets a clean invoice. You keep the crew, the job costs, and a year log in one place.
        </p>
        <ul className="mt-4 max-w-2xl space-y-1 text-sm text-[var(--cr-muted)]">
          <li>One page for proposals and invoices. Turn a proposal into an invoice in one click.</li>
          <li>Crew hours and the saved rate fill the wage total. A raise does not change old jobs.</li>
          <li>Paid invoices, expenses, and pay in one year log. Your phone and computer share the account.</li>
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="/signup" className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-medium text-slate-950">Start free</a>
          <a href="#pricing" className="rounded-lg border border-teal-400/40 px-5 py-3 text-sm">See pricing</a>
        </div>
        <p className="mt-3 text-sm text-[var(--cr-muted)]">14-day trial. No card to start.</p>

<div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="sample-sheet rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="muted text-xs uppercase tracking-wide">What the customer sees</p>
            <div className="mt-2 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">INV-1042</h2>
                <p className="muted mt-2 text-sm">North Yard Co.</p>
                <p className="muted text-sm">Bill to: Lena Ortiz</p>
              </div>
              <div className="muted text-right text-sm">
                <p>Date: 2026-10-01</p>
                <p>Due: 2026-10-15</p>
                <p>Time: 8:00 to 12:00</p>
              </div>
            </div>
            <div className="mt-6 flex justify-between border-t border-slate-200 pt-3 text-sm"><span>Fall cleanup</span><span>$520.00</span></div>
            <div className="mt-2 flex justify-between text-sm"><span>Haul away</span><span>$265.00</span></div>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 font-semibold"><span>Total</span><span>$785.00</span></div>
            <p className="muted mt-4 text-sm">Pay here: Venmo @northyard</p>
          </div>

          <div className="sample-owner rounded-2xl border border-amber-300 bg-amber-50 p-6">
            <p className="label text-xs uppercase tracking-wide">What you see</p>
            <h2 className="mt-2 text-xl font-semibold">Your costs and crew</h2>
            <p className="muted mt-1 text-sm">Hidden from the customer PDF.</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Gas / diesel</span><span>$18.00</span></div>
              <div className="flex justify-between"><span>Drive time</span><span>0 hrs 25 min</span></div>
              <div className="flex justify-between"><span>Roul · 4 hrs · $21/hr</span><span>$84.00</span></div>
              <div className="flex justify-between"><span>Henry · 4 hrs · $19/hr</span><span>$76.00</span></div>
              <div className="flex justify-between font-medium"><span>Labor / wages</span><span>$160.00</span></div>
            </div>
            <div className="mt-4 space-y-1 border-t border-amber-200 pt-3 text-sm">
              <div className="flex justify-between"><span>Job cost</span><span>$178.00</span></div>
              <div className="flex justify-between"><span>You charge</span><span>$785.00</span></div>
              <div className="flex justify-between"><span>Left over</span><span>$607.00</span></div>
              <div className="flex justify-between"><span>Set aside 30%</span><span>$182.10</span></div>
              <div className="flex justify-between font-semibold"><span>Yours after set-aside</span><span>$424.90</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-teal-400">1</p>
          <h2 className="mt-2 font-semibold">Write the proposal</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Price the job. Your costs stay on your side. Turn it into an invoice when they say yes.</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-teal-400">2</p>
          <h2 className="mt-2 font-semibold">Send the invoice</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Add the crew. Hours and the saved rate fill the wage total.</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-teal-400">3</p>
          <h2 className="mt-2 font-semibold">Mark it paid</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Record the payment. The year log keeps the receipt and the pay.</p>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-2xl font-semibold">Simple pricing</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-[var(--cr-muted)]">Trial</p>
            <p className="mt-2 text-3xl font-semibold">14 days</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">Full tools. No card. Then old work stays viewable.</p>
          </div>
          <div className="rounded-2xl border border-teal-400 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-teal-400">Monthly</p>
            <p className="mt-2 text-3xl font-semibold">$7.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">After the trial. Keep saving new jobs.</p>
          </div>
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-[var(--cr-muted)]">3 months</p>
            <p className="mt-2 text-3xl font-semibold">$19.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">Same tools, paid ahead.</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--cr-muted)]">
          A raise changes the next job only. The year packet is a log, not a tax return. Checkout comes later.
        </p>
      </section>

      <footer className="border-t border-teal-500/20 px-4 py-6 text-center text-sm text-[var(--cr-muted)]">
        <a href="/login" className="px-3 sm:hidden">Log in</a>
        <a href="/privacy" className="px-3">Privacy</a>
        <span>·</span>
        <a href="/terms" className="px-3">Terms</a>
      </footer>
    </main>
  );
}