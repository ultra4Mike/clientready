"use client";

import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/invoice", label: "Invoices" },
  { href: "/proposal", label: "Proposals" },
  { href: "/clients", label: "Clients" },
  { href: "/documents", label: "Documents" },
  { href: "/calendar", label: "Calendar" },
  { href: "/upcoming", label: "This week" },
  { href: "/collect", label: "Collect" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
  { href: "/backup", label: "Backup" },
];

function Logo() {
  return (
    <a href="/dashboard" className="flex items-center gap-2 font-semibold">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect x="3" y="3" width="26" height="26" rx="6" className="fill-teal-400 dark:fill-teal-400" />
        <path
          d="M12 10h8l4 4v10a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z"
          className="fill-slate-950 dark:fill-slate-950"
        />
        <path d="M20 10v4h4" className="fill-teal-200" />
        <text
          x="16"
          y="23"
          textAnchor="middle"
          fontSize="11"
          fontFamily="Arial"
          className="fill-teal-300"
        >
          C
        </text>
      </svg>
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
  const [navMode, setNavMode] = useState("auto");
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("clientready-theme") || "dark";
    const savedNav = window.localStorage.getItem("clientready-nav") || "auto";
    setTheme(savedTheme);
    setNavMode(savedNav);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");
    document.documentElement.classList.toggle("light", savedTheme === "light");
    const onResize = () => setWide(window.innerWidth >= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const useSidebar =
    navMode === "sidebar" || (navMode === "auto" && wide);

  function saveTheme(next: string) {
    setTheme(next);
    window.localStorage.setItem("clientready-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  function saveNav(next: string) {
    setNavMode(next);
    window.localStorage.setItem("clientready-nav", next);
  }

  async function logOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const nav = (
    <nav className={useSidebar ? "space-y-1" : "flex flex-wrap gap-3"}>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="block rounded-lg px-3 py-2 text-sm hover:bg-teal-500/15"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--cr-bg)] text-[var(--cr-text)]">
      {useSidebar ? (
        <div className="flex min-h-screen">
          <aside className="hidden w-60 shrink-0 border-r border-teal-500/20 bg-[var(--cr-panel)] p-4 md:block">
            <Logo />
            <div className="mt-6">{nav}</div>
          </aside>
          <div className="flex-1">
            <header className="flex items-center justify-between border-b border-teal-500/20 px-4 py-3 md:px-6">
              <h1 className="text-lg font-semibold">{title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button type="button" onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button
                  type="button"
                  onClick={() => saveNav(navMode === "sidebar" ? "top" : "sidebar")}
                >
                  {useSidebar ? "Top menu" : "Sidebar"}
                </button>
                <button type="button" onClick={logOut}>
                  Log out
                </button>
              </div>
            </header>
            <div className="p-4 md:p-6">{children}</div>
          </div>
        </div>
      ) : (
        <>
          <header className="border-b border-teal-500/20 bg-[var(--cr-panel)] px-4 py-3">
            <div className="flex items-center justify-between">
              <Logo />
              <div className="flex items-center gap-3 text-sm">
                <button type="button" onClick={() => saveTheme(theme === "dark" ? "light" : "dark")}>
                  {theme === "dark" ? "Light" : "Dark"}
                </button>
                <button type="button" onClick={logOut}>
                  Log out
                </button>
              </div>
            </div>
            <div className="mt-3">{nav}</div>
          </header>
          <div className="p-4 md:p-6">
            <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
            {children}
          </div>
        </>
      )}
    </div>
  );
}