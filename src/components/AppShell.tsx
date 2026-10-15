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
  { href: "/upcoming", label: "This week" },
  { href: "/history", label: "History" },
  { href: "/employees", label: "Employees" },
  { href: "/drafts", label: "Crew drafts" },
  { href: "/year", label: "Year packet" },
  { href: "/backup", label: "Backup" },
];

function Logo() {
  return (
    <a href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-sm font-bold text-slate-950">
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
    <nav className={wide ? "space-y-1" : "-mx-1 flex gap-1 overflow-x-auto whitespace-nowrap pb-1"}>
      {mainLinks.map((link) => (
        <a key={link.href} href={link.href} className={linkClass(link.href)}>
          {link.label}
        </a>
      ))}
      <button
        type="button"
        onClick={() => setMoreOpen(!moreOpen)}
        className="block rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-teal-500/15"
      >
        More
      </button>
      {moreOpen &&
        moreLinks.map((link) => (
          <a key={link.href} href={link.href} className={linkClass(link.href)}>
            {link.label}
          </a>
        ))}
    </nav>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-3 text-sm font-medium sm:gap-4">
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
            <div className="mt-6">{nav}</div>
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
            <div className="mt-3">{nav}</div>
          </header>
          <div className="app-main p-4">
            <div className="mx-auto w-full max-w-6xl">
            <h1 className="print-hide mb-4 text-2xl font-bold tracking-tight">{title}</h1>
            {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}