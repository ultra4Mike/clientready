"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { searchAll, serverSearchRows, type SearchHit } from "@/lib/search";

const KIND: Record<SearchHit["kind"], string> = { document: "Doc", client: "Client", part: "Part" };
const KIND_ICON: Record<SearchHit["kind"], string> = { document: "📄", client: "👤", part: "🔧" };

const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Search button in the top bar + Ctrl/Cmd+K or "/" to open. Searches this device first, then the server; nothing is changed. */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const [server, setServer] = useState<{ q: string; rows: Awaited<ReturnType<typeof serverSearchRows>> } | null>(null);
  // QA3: after a short pause, also search the server so records not on this device are found.
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    let live = true;
    const timer = window.setTimeout(() => { void serverSearchRows(query).then((rows) => { if (live) setServer({ q: query, rows }); }); }, 300);
    return () => { live = false; window.clearTimeout(timer); };
  }, [open, query]);
  const hits = open ? searchAll(query, 20, server?.q === query ? server.rows : {}) : [];
  const go = (hit: SearchHit | undefined) => { if (hit) window.location.assign(hit.href); };

  return (
    <>
      <button type="button" aria-label="Search" data-testid="search-open" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-teal-500/10 min-[900px]:w-auto min-[900px]:gap-2 min-[900px]:h-10 min-[900px]:min-w-52 min-[900px]:justify-start min-[900px]:rounded-lg min-[900px]:border min-[900px]:border-teal-500/25 min-[900px]:bg-[var(--cr-card)] min-[900px]:px-3 min-[900px]:text-[var(--cr-muted)] min-[900px]:hover:border-teal-400">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="hidden min-[900px]:inline">Search</span>
        <kbd aria-hidden="true" className="ml-auto hidden rounded border border-slate-500/30 px-1.5 py-0.5 font-sans text-[11px] font-medium min-[900px]:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/60 backdrop-blur-sm sm:items-start sm:p-3 sm:pt-[12vh]" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
          <div role="dialog" aria-label="Search" data-testid="search-dialog" className="flex w-full flex-col overflow-hidden bg-[var(--cr-panel)] pt-[env(safe-area-inset-top)] text-[var(--cr-text)] shadow-2xl sm:max-w-xl sm:rounded-2xl sm:border sm:border-teal-500/30 sm:pt-0">
            <div className="flex items-center gap-1 border-b border-teal-500/20 pr-2">
            <input ref={inputRef} type="search" name="q" aria-label="Search invoices, clients and parts" data-testid="search-input" placeholder="Search invoices, clients, items…" value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                if (event.key === "Enter") go(hits[active]);
              }}
              className="min-h-14 min-w-0 flex-1 bg-transparent px-5 py-4 text-base outline-none placeholder:text-[var(--cr-muted)] sm:text-lg" />
              <button type="button" data-testid="search-cancel" onClick={() => setOpen(false)} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Cancel</button>
            </div>
            <ul className="flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:max-h-[60vh] sm:flex-none" data-testid="search-results">
              {query.trim().length >= 2 && hits.length === 0 && <li className="px-4 py-10 text-center text-sm text-[var(--cr-muted)]" data-testid="search-empty"><span aria-hidden="true" className="mb-2 block text-2xl">🔍</span>No matches on this device.</li>}
              {hits.map((hit, index) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <a href={hit.href} data-testid="search-hit" data-kind={hit.kind} aria-selected={index === active} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition focus-visible:bg-teal-500/15 focus-visible:ring-2 focus-visible:ring-teal-400/50 ${index === active ? "bg-teal-500/15 ring-1 ring-teal-500/30" : "hover:bg-teal-500/10"}`}>
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-base">{KIND_ICON[hit.kind]}</span>
                    <span className="order-last ml-auto shrink-0 rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">{KIND[hit.kind]}</span>
                    <span className="min-w-0"><span className="block truncate font-medium">{hit.title}</span>{hit.detail && <span className="block truncate text-xs text-[var(--cr-muted)]">{hit.detail}</span>}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
