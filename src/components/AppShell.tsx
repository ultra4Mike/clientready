"use client";

import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearLocalBusiness } from "@/lib/account-cache";
import { isCrewUser } from "@/lib/crew";
import SyncPill from "@/components/SyncPill";

const mainLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/clients", label: "Clients" },
  { href: "/collect", label: "Collect" },
  { href: "/calendar", label: "Calendar" },
];

const moreLinks = [
  { href: "/today", label: "Today" },
  { href: "/upcoming", label: "This week" },
  { href: "/history", label: "History" },
  { href: "/employees", label: "Employees" },
  { href: "/drafts", label: "Crew drafts" },
  { href: "/year", label: "Year packet" },
  { href: "/backup", label: "Backup" },
];

const ALL_LINKS = [...mainLinks, ...moreLinks];
const byHref = (href: string) => ALL_LINKS.find((link) => link.href === href)!;
const NAV_GROUPS = [
  { label: "Work", links: ["/dashboard", "/today", "/calendar", "/upcoming", "/drafts"].map(byHref) },
  { label: "Clients", links: ["/clients", "/history"].map(byHref) },
  { label: "Money", links: ["/documents", "/collect", "/year"].map(byHref) },
  { label: "Team", links: ["/employees"].map(byHref) },
];
const BOTTOM_LINKS = [{ href: "/profile", label: "Settings" }, byHref("/backup")];

const QUICK_CREATE = [
  { href: "/invoice", label: "New invoice" },
  { href: "/proposal", label: "New proposal" },
  { href: "/clients", label: "Add client" },
  { href: "/schedule", label: "Schedule" },
];

const TAB_HREFS = ["/dashboard", "/documents", "/calendar", "/clients"];

const ICON_PATHS: Record<string, string> = {
  "/dashboard": "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z",
  "/documents": "M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5M9 13h6M9 17h6",
  "/calendar": "M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zm-1 5h16M8 3v4m8-4v4",
  "/clients": "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1m6.5-9a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.9M16 4.1a3.5 3.5 0 010 6.8",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

function TabIcon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

function Logo() {
  return (
    <a href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500 text-sm font-bold text-slate-950!">
        C
      </span>
      <span>ClientReady</span>
    </a>
  );
}

export default function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const [theme, setTheme] = useState("dark");
  const [wide, setWide] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
useEffect(() => {
    const savedTheme = window.localStorage.getItem("clientready-theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");
    document.documentElement.classList.toggle("light", savedTheme === "light");
    const onResize = () => setWide(window.innerWidth >= 900);
    onResize();
    window.addEventListener("resize", onResize);
    isCrewUser().then((crew) => {
      if (crew) window.location.href = "/crew";
    });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function saveTheme(next: string) {
    setTheme(next);
    window.localStorage.setItem("clientready-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  async function logOut() {
    clearLocalBusiness();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function linkClass(href: string) {
    return "block rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-teal-500/15";
  }

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)]">{group.label}</p>
            <div className="space-y-0.5">
              {group.links.map((link) => (
                <a key={link.href} href={link.href} className={linkClass(link.href)}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-0.5 border-t border-teal-500/15 pt-3">
        {BOTTOM_LINKS.map((link) => (
          <a key={link.href} href={link.href} className={linkClass(link.href)}>
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );

  const actions = (
    <div className="tap-row flex flex-wrap items-center gap-3 text-sm font-medium sm:gap-4">
      <SyncPill />
      <button type="button" onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? "Light" : "Dark"}
      </button>
      <a href="/profile">Profile</a>
      <button type="button" onClick={logOut}>
        Log out
      </button>
    </div>
  );

  return (
    <div className="app-root min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      {wide ? (
        <div className="app-root flex min-h-screen">
          <aside className="sticky top-0 h-screen w-56 shrink-0 overflow-y-auto border-r border-teal-500/20 bg-[var(--cr-panel)] p-4">
            <Logo />
            <div className="mt-6 flex min-h-[calc(100%-4rem)] flex-col">{nav}</div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-teal-500/20 bg-[var(--cr-bg)] px-6 py-3">
              <h1 className="text-lg font-semibold">{title}</h1>
              {actions}
            </header>
            <div className="app-main p-6"><div className="mx-auto w-full max-w-6xl">{children}</div></div>
          </div>
        </div>
      ) : (
        <>
          <header className="border-b border-teal-500/20 bg-[var(--cr-panel)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Logo />
              {actions}
            </div>
          </header>
          <div className="app-main p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] print:pb-4">
            <div className="mx-auto w-full max-w-6xl">
            <h1 className="print-hide mb-4 text-2xl font-bold tracking-tight">{title}</h1>
            {children}
            </div>
          </div>
          {moreOpen && (
            <div className="fixed inset-0 z-40 print:hidden" onClick={() => setMoreOpen(false)}>
              <div className="absolute inset-0 bg-slate-950/60" />
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-teal-500/20 bg-[var(--cr-panel)] px-4 pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-500/40" />
                <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                  {[...NAV_GROUPS, { label: "Settings", links: BOTTOM_LINKS }].map((group) => {
                    const links = group.links.filter((link) => !TAB_HREFS.includes(link.href));
                    if (!links.length) return null;
                    return (
                      <div key={group.label}>
                        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)]">{group.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {links.map((link) => (
                            <a key={link.href} href={link.href} className="rounded-xl border border-teal-500/20 bg-[var(--cr-card)] px-4 py-3 text-sm font-medium transition hover:border-teal-400">
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {createOpen && <div className="fixed inset-0 z-40 print:hidden" onClick={() => setCreateOpen(false)} />}
          <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 print:hidden">
            {createOpen && (
              <div className="w-48 overflow-hidden rounded-2xl border border-teal-500/20 bg-[var(--cr-panel)] py-1 shadow-2xl">
                {QUICK_CREATE.map((item) => (
                  <a key={item.href} href={item.href} className="block px-4 py-3 text-sm font-medium transition hover:bg-teal-500/10">
                    {item.label}
                  </a>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label="Quick create"
              aria-expanded={createOpen}
              onClick={() => setCreateOpen(!createOpen)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500 text-slate-950! shadow-lg shadow-teal-500/30 transition hover:bg-teal-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-7 w-7 transition-transform ${createOpen ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </div>
          <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t border-teal-500/20 bg-[var(--cr-panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden">
            <div className="mx-auto grid max-w-lg grid-cols-5">
              {mainLinks.filter((link) => TAB_HREFS.includes(link.href)).map((link) => (
                <a key={link.href} href={link.href} className="flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition hover:text-teal-400">
                  <TabIcon name={link.href} />
                  {link.href === "/dashboard" ? "Home" : link.label}
                </a>
              ))}
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(!moreOpen)}
                className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition hover:text-teal-400 ${moreOpen ? "text-teal-400" : ""}`}
              >
                <TabIcon name="more" />
                More
              </button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}