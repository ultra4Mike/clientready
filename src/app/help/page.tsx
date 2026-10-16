"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { HELP_ARTICLES, SUPPORT_EMAIL } from "@/lib/help/articles";

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = useMemo(() => ["All", ...Array.from(new Set(HELP_ARTICLES.map((a) => a.category)))], []);
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return HELP_ARTICLES.filter((a) => {
      if (category !== "All" && a.category !== category) return false;
      const hay = [a.question, a.category, ...a.steps, ...(a.keywords || [])].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, category]);

  return (
    <AppShell title="Help">
      <PageHeader title="Help Center" subtitle="Search answers and step-by-step fixes." />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help (e.g. pay, offline, crew)" aria-label="Search help"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-[var(--cr-panel)] px-3 py-2.5 text-sm dark:border-teal-500/30" />
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${c === category ? "bg-teal-500 text-slate-950!" : "border border-teal-500/30 hover:bg-teal-500/10"}`}>{c}</button>
        ))}
      </div>
      <div className="space-y-2">
        {results.map((a) => (
          <details key={a.id} id={a.id} className="rounded-xl border border-slate-200 bg-[var(--cr-panel)] p-4 dark:border-teal-500/20">
            <summary className="cursor-pointer font-medium">{a.question}<span className="ml-2 text-xs text-[var(--cr-muted)]">{a.category}</span></summary>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--cr-muted)]">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
        ))}
        {!results.length && <p className="text-sm text-[var(--cr-muted)]">No answers match. Try another word.</p>}
      </div>
      <div className="mt-8 rounded-xl border border-teal-500/20 p-4 text-sm">
        Still need help? <a className="font-semibold text-teal-600 dark:text-teal-300" href={`mailto:${SUPPORT_EMAIL}?subject=ClientReady%20help`}>Email support</a>
      </div>
    </AppShell>
  );
}
