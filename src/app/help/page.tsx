"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import LegalLinks from "@/components/LegalLinks";
import { HELP_ARTICLES, HELP_CATEGORIES, SUPPORT_EMAIL, type HelpArticle } from "@/lib/help/articles";
import { helpMatches } from "@/lib/help/search";

const byId = new Map(HELP_ARTICLES.map((a) => [a.id, a]));
const haystack = (a: HelpArticle) =>
  [a.question, a.category, a.summary || "", ...a.steps, ...(a.tips || []), ...(a.keywords || [])].join(" ").toLowerCase();

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const categories = useMemo(() => ["All", ...HELP_CATEGORIES.filter((c) => HELP_ARTICLES.some((a) => a.category === c))], []);
  const results = useMemo(() => {
    return HELP_ARTICLES.filter((a) => (category === "All" || a.category === category) && helpMatches(haystack(a), query));
  }, [query, category]);

  function jump(id: string) {
    setQuery("");
    setCategory("All");
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Deep link: /help?a=<article id> opens that article.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("a");
    if (id && byId.has(id)) { const t = setTimeout(() => jump(id), 0); return () => clearTimeout(t); }
  }, []);

  return (
    <AppShell title="Help">
      <PageHeader title="Help Center" subtitle={`${HELP_ARTICLES.length} answers, how-tos and fixes. Search or pick a topic.`} />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help (e.g. pay, offline, crew, email)" aria-label="Search help"
        className="mb-3 w-full rounded-lg border border-slate-300 bg-[var(--cr-panel)] px-3 py-2.5 text-sm dark:border-teal-500/30" />
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${c === category ? "bg-teal-500 text-slate-950!" : "border border-teal-500/30 hover:bg-teal-500/10"}`}>{c}</button>
        ))}
      </div>
      <p className="mb-2 text-xs text-[var(--cr-muted)]">{results.length} result{results.length === 1 ? "" : "s"}</p>
      <div className="space-y-2">
        {results.map((a) => (
          <details key={a.id} id={a.id} open={open === a.id || undefined}
            onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setOpen(a.id); }}
            className="scroll-mt-24 rounded-xl border border-slate-200 bg-[var(--cr-panel)] p-4 dark:border-teal-500/20">
            <summary className="cursor-pointer font-medium">{a.question}<span className="ml-2 text-xs text-[var(--cr-muted)]">{a.category}</span></summary>
            {a.summary && <p className="mt-3 text-sm">{a.summary}</p>}
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--cr-muted)]">{a.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {a.tips?.length ? (
              <div className="mt-3 rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">Tips</p>
                <ul className="list-disc space-y-1 pl-5">{a.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            ) : null}
            {a.related?.some((id) => byId.has(id)) ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="text-[var(--cr-muted)]">Related:</span>
                {a.related.filter((id) => byId.has(id)).map((id) => (
                  <button key={id} type="button" onClick={() => jump(id)} className="text-teal-600 underline-offset-2 hover:underline dark:text-teal-300">{byId.get(id)!.question}</button>
                ))}
              </div>
            ) : null}
          </details>
        ))}
        {!results.length && <p className="text-sm text-[var(--cr-muted)]">No answers match. Try another word, or email support below.</p>}
      </div>
      <div className="mt-8 rounded-xl border border-teal-500/20 p-4 text-sm">
        Still need help? <a className="font-semibold text-teal-600 dark:text-teal-300" href={`mailto:${SUPPORT_EMAIL}?subject=ClientReady%20help`}>Email support</a>
      </div>
      <LegalLinks className="mt-4 text-center" />
    </AppShell>
  );
}
