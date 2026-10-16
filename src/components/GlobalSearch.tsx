"use client";

import { useEffect, useRef, useState } from "react";
import { searchAll, type SearchHit } from "@/lib/search";

const KIND: Record<SearchHit["kind"], string> = { document: "Doc", client: "Client", part: "Part" };

/** Search button in the top bar + Ctrl/Cmd+K or "/" to open. Searches this device's cache; nothing is changed. */
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
  const hits = open ? searchAll(query) : [];
  const go = (hit: SearchHit | undefined) => { if (hit) window.location.assign(hit.href); };

  return (
    <>
      <button type="button" aria-label="Search" data-testid="search-open" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-teal-500/10 min-[900px]:w-auto min-[900px]:gap-2 min-[900px]:rounded-lg min-[900px]:px-3">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <span className="hidden min-[900px]:inline">Search</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-[10vh]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Search" data-testid="search-dialog" className="w-full max-w-xl overflow-hidden rounded-2xl border border-teal-500/30 bg-[var(--cr-panel)] text-[var(--cr-text)] shadow-xl" onClick={(event) => event.stopPropagation()}>
            <input ref={inputRef} type="search" name="q" aria-label="Search invoices, clients and parts" data-testid="search-input" placeholder="Invoice #, client, phone, address, item…" value={query}
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
                if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                if (event.key === "Enter") go(hits[active]);
              }}
              className="w-full border-b border-teal-500/20 bg-transparent px-4 py-3 text-base outline-none" />
            <ul className="max-h-[60vh] overflow-y-auto" data-testid="search-results">
              {query.trim().length >= 2 && hits.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--cr-muted)]" data-testid="search-empty">No matches on this device.</li>}
              {hits.map((hit, index) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <a href={hit.href} data-testid="search-hit" data-kind={hit.kind} aria-selected={index === active} className={`flex min-h-11 items-center gap-3 px-4 py-2 text-sm ${index === active ? "bg-teal-500/15" : "hover:bg-teal-500/10"}`}>
                    <span className="w-12 shrink-0 text-xs font-semibold uppercase text-teal-600 dark:text-teal-300">{KIND[hit.kind]}</span>
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
