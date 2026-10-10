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
          <li>Proposals and invoices, with your costs hidden from the customer.</li>
          <li>Crew hours and saved rates fill the wage total for that job.</li>
          <li>Paid invoices, expenses, and pay in one year log.</li>
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="/signup" className="rounded-lg bg-teal-400 px-5 py-3 text-sm font-medium text-slate-950">Start free</a>
          <a href="#pricing" className="rounded-lg border border-teal-400/40 px-5 py-3 text-sm">See pricing</a>
        </div>
        <p className="mt-3 text-sm text-[var(--cr-muted)]">3 documents free. No card to start.</p>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="sample-sheet rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">What the customer sees</p>
            <div className="mt-2 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">INV-1042</h2>
                <p className="mt-2 text-sm text-slate-600">North Yard Co.</p>
                <p className="text-sm text-slate-600">Bill to: Lena Ortiz</p>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>Date: 2026-10-01</p>
                <p>Due: 2026-10-15</p>
                <p>Time: 8:00 to 12:00</p>
              </div>
            </div>
            <div className="mt-6 flex justify-between border-t border-slate-200 pt-3 text-sm"><span>Fall cleanup</span><span>$240.00</span></div>
            <div className="mt-2 flex justify-between text-sm"><span>Haul away</span><span>$80.00</span></div>
            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 font-semibold"><span>Total</span><span>$320.00</span></div>
            <p className="mt-4 text-sm text-slate-600">Pay here: Venmo @northyard</p>
          </div>

          <div className="sample-sheet rounded-2xl border border-amber-300 bg-amber-50 p-6 text-slate-900">
            <p className="text-xs uppercase tracking-wide text-amber-800">What you see</p>
            <h2 className="mt-2 text-xl font-semibold">Your costs and crew</h2>
            <p className="mt-1 text-sm text-slate-600">Hidden from the customer PDF.</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Gas / mileage</span><span>$18.00</span></div>
              <div className="flex justify-between"><span>Roul · 4 hrs · $21/hr</span><span>$84.00</span></div>
              <div className="flex justify-between"><span>Henry · 4 hrs · $19/hr</span><span>$76.00</span></div>
              <div className="flex justify-between font-medium"><span>Labor / wages</span><span>$160.00</span></div>
            </div>
            <div className="mt-4 space-y-1 border-t border-amber-200 pt-3 text-sm">
              <div className="flex justify-between"><span>Job cost</span><span>$178.00</span></div>
              <div className="flex justify-between"><span>You charge</span><span>$320.00</span></div>
              <div className="flex justify-between"><span>Left over</span><span>$142.00</span></div>
              <div className="flex justify-between"><span>Set aside 30%</span><span>$42.60</span></div>
              <div className="flex justify-between font-semibold"><span>Yours after set-aside</span><span>$99.40</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <p className="text-sm text-teal-400">1</p>
          <h2 className="mt-2 font-semibold">Write the proposal</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Scope and price for the customer. Your costs stay on your side.</p>
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
            <p className="text-sm text-[var(--cr-muted)]">Start</p>
            <p className="mt-2 text-3xl font-semibold">Free</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">3 documents. No card.</p>
          </div>
          <div className="rounded-2xl border border-teal-400 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-teal-400">Monthly</p>
            <p className="mt-2 text-3xl font-semibold">$7.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">After the 3 free documents.</p>
          </div>
          <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
            <p className="text-sm text-[var(--cr-muted)]">3 months</p>
            <p className="mt-2 text-3xl font-semibold">$19.99</p>
            <p className="mt-3 text-sm text-[var(--cr-muted)]">Same tools, paid ahead.</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--cr-muted)]">A raise changes the next job only. The year packet is a log, not a tax return.</p>
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