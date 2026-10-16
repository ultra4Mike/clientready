"use client";

import { PLANS, PRICES_ARE_PLACEHOLDERS } from "@/lib/plans";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [theme, setTheme] = useState("dark");
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    const done = new URLSearchParams(window.location.search).get("deleted") === "1";
    if (done) window.history.replaceState(null, "", "/");
    setDeleted(done);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("clientready-theme") || "dark";
    // Set after mount (not during the effect body) so the static render and first client render match.
    Promise.resolve().then(() => setTheme(saved));
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
      {deleted && <p role="status" data-testid="account-deleted" className="bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white">Your account was deleted.</p>}
      <header className="sticky top-0 z-20 border-b border-teal-500/20 bg-[var(--cr-panel)] print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-slate-950!">C</span>
            ClientReady
          </Link>
          <div className="flex items-center gap-2 text-sm sm:gap-4">
            <button type="button" onClick={toggleTheme} className="hidden font-medium transition hover:text-teal-500 sm:inline">{theme === "dark" ? "Light" : "Dark"}</button>
            <a href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/30 px-3 font-medium transition hover:border-teal-400 hover:text-teal-500 sm:min-h-0 sm:border-0 sm:px-0">Log in</a>
            <a href="/signup" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-teal-500 px-3 py-2 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:px-4">Start free</a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-20 lg:text-center">
        <p className="inline-flex rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">For small businesses</p>
        <h1 className="mt-4 max-w-3xl text-4xl lg:mx-auto font-bold leading-tight tracking-tight md:text-6xl">Get paid. Stay client-ready.</h1>
        <p className="mt-5 max-w-2xl text-lg lg:mx-auto leading-8 text-[var(--cr-muted)]">
          The customer gets a clean invoice. You keep the crew, the job costs, and a year log in one place.
        </p>
        <ul className="mt-5 max-w-2xl text-left lg:mx-auto lg:w-fit list-inside list-disc space-y-2 text-sm text-[var(--cr-muted)] marker:text-teal-500">
          <li>One page for proposals and invoices. Turn a proposal into an invoice in one click.</li>
          <li>Crew hours and the saved rate fill the wage total. A raise does not change old jobs.</li>
          <li>Paid invoices, expenses, and pay in one year log. Your phone and computer share the account.</li>
        </ul>
        <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center lg:justify-center">
          <a href="/signup" className="rounded-lg bg-teal-500 px-6 py-3 text-center text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Start free</a>
          <a href="#pricing" className="rounded-lg border border-teal-400/40 px-6 py-3 text-center text-sm font-medium transition hover:border-teal-400">See pricing</a>
        </div>
        <p className="mt-3 text-sm text-[var(--cr-muted)]">14-day trial. No card to start.</p>

<div className="mt-12 grid gap-6 text-left lg:grid-cols-2 lg:items-stretch">
          <div className="sample-sheet flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="muted text-xs uppercase tracking-wide">What the customer sees</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
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
            <div className="mt-auto pt-6"><p className="pay-box rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">Pay here: Venmo @northyard</p><p className="muted mt-3 text-xs">Thank you for your business.</p></div>
          </div>

          <div className="sample-owner rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
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

      <section className="mx-auto grid max-w-6xl auto-rows-fr gap-4 px-4 pb-16 sm:grid-cols-3 sm:pb-20">
        <div className="h-full rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-sm font-bold text-teal-600 dark:text-teal-300">1</p>
          <h2 className="mt-3 font-semibold">Write the proposal</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Price the job. Your costs stay on your side. Turn it into an invoice when they say yes.</p>
        </div>
        <div className="h-full rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-sm font-bold text-teal-600 dark:text-teal-300">2</p>
          <h2 className="mt-3 font-semibold">Send the invoice</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Add the crew. Hours and the saved rate fill the wage total.</p>
        </div>
        <div className="h-full rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <p className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/15 text-sm font-bold text-teal-600 dark:text-teal-300">3</p>
          <h2 className="mt-3 font-semibold">Mark it paid</h2>
          <p className="mt-2 text-sm text-[var(--cr-muted)]">Record the payment. The year log keeps the receipt and the pay.</p>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Simple pricing</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3" data-testid="home-pricing">
          {PLANS.map((plan) => (
            <div key={plan.id} className={`rounded-2xl bg-[var(--cr-card)] p-6 ${plan.highlight ? "border-2 border-teal-400 shadow-md" : "border border-teal-500/20 shadow-sm"}`}>
              <p className={`text-sm ${plan.highlight ? "font-semibold text-teal-600 dark:text-teal-300" : "text-[var(--cr-muted)]"}`}>{plan.name}</p>
              <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{plan.price}</p>
              <p className="mt-3 text-sm text-[var(--cr-muted)]">{plan.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-[var(--cr-muted)]">
          A raise changes the next job only. The year packet is a log, not a tax return. Checkout comes later. <Link href="/plans" className="underline">See plans</Link>{PRICES_ARE_PLACEHOLDERS ? " (placeholder prices)" : ""}.
        </p>
      </section>

      <footer className="border-t border-teal-500/20 px-4 py-6 text-center text-sm text-[var(--cr-muted)]">
        <a href="/login" className="inline-flex min-h-11 items-center px-3 hover:text-teal-500 sm:hidden">Log in</a>
        <a href="/privacy" className="inline-flex min-h-11 items-center px-3 hover:text-teal-500">Privacy</a>
        <span>·</span>
        <a href="/terms" className="inline-flex min-h-11 items-center px-3 hover:text-teal-500">Terms</a>
      </footer>
    </main>
  );
}