"use client";

import TrialBanner from "@/components/TrialBanner";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearLocalBusiness } from "@/lib/account-cache";
import { isCrewUser } from "@/lib/crew";
import SyncPill from "@/components/SyncPill";
import { flushClientContactQueue } from "@/lib/client-sync";
import MobileNav, { BOTTOM_LINKS, NAV_GROUPS } from "@/components/MobileNav";

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
  showTitle = false,
}: {
  children: ReactNode;
  title: string;
  /** Show `title` in the desktop top bar. Off by default: every page renders its own PageHeader as the single title. */
  showTitle?: boolean;
}) {
  const pathname = usePathname() || "";
  const [theme, setTheme] = useState("dark");
useEffect(() => {
    const savedTheme = window.localStorage.getItem("clientready-theme") || "dark";
    Promise.resolve().then(() => setTheme(savedTheme)); // storage read right after mount (same pattern as fae8b09)
    document.documentElement.classList.toggle("dark", savedTheme === "dark");
    document.documentElement.classList.toggle("light", savedTheme === "light");
    isCrewUser().then((crew) => {
      if (crew) window.location.href = "/crew";
    });
    // Retry client contact updates that failed to reach the cloud (offline or error).
    const retry = () => void flushClientContactQueue().catch(() => undefined);
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
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
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
    return `block rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-teal-500/15 font-semibold text-teal-700 dark:text-teal-300!" : "text-slate-700 hover:bg-teal-500/10 hover:text-slate-950 dark:text-[var(--cr-text)] dark:hover:text-[var(--cr-text)]"}`;
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

  // One header action set for every size (SyncPill mounts once); size-specific bits use CSS breakpoints only.
  const actions = (
    <div className="tap-row flex items-center gap-1 text-sm font-medium min-[900px]:flex-wrap min-[900px]:gap-4">
      <SyncPill />
      <button
        type="button"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}
        className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-teal-500/10 min-[900px]:h-auto min-[900px]:w-auto min-[900px]:rounded-none min-[900px]:hover:bg-transparent"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 min-[900px]:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {theme === "dark" ? <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z" /> : <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />}
        </svg>
        <span className="hidden min-[900px]:inline">{theme === "dark" ? "Light" : "Dark"}</span>
      </button>
      <a href="/profile" className="hidden min-h-11 items-center rounded-lg px-3 transition hover:bg-teal-500/10 hover:text-teal-500 min-[900px]:inline-flex">Profile</a>
      <button type="button" onClick={logOut} className="hidden min-h-11 whitespace-nowrap items-center rounded-lg px-3 transition hover:bg-teal-500/10 hover:text-teal-500 min-[900px]:inline-flex">
        Log out
      </button>
    </div>
  );

  return (
    <div className="app-root min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      <div className="app-root min-[900px]:flex min-[900px]:min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-[var(--cr-panel)] p-4 shadow-[1px_0_0_rgba(0,0,0,0.02)] min-[900px]:block dark:border-teal-500/20 print:hidden">
          <Logo />
          <div className="mt-6 flex min-h-[calc(100%-4rem)] flex-col">{nav}</div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="border-b border-teal-500/20 bg-[var(--cr-panel)] px-4 py-1.5 min-[900px]:sticky min-[900px]:top-0 min-[900px]:z-20 min-[900px]:bg-[var(--cr-bg)] min-[900px]:px-6 min-[900px]:py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-[900px]:hidden"><Logo /></div>
              {showTitle ? <h1 className="hidden text-lg font-semibold min-[900px]:block">{title}</h1> : <span className="sr-only">{title}</span>}
              {actions}
            </div>
          </header>
          <div className="app-main p-4 pb-[calc(10rem+env(safe-area-inset-bottom))] min-[900px]:p-6 print:pb-4">
            <div className="mx-auto w-full max-w-6xl"><TrialBanner />{children}</div>
          </div>
        </div>
      </div>
      <MobileNav onLogOut={logOut} />
    </div>
  );
}