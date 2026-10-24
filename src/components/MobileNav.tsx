"use client";

import { useState } from "react";

const mainLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/clients", label: "Clients" },
  { href: "/collect", label: "Collect" },
  { href: "/calendar", label: "Calendar" },
];

const moreLinks = [
  { href: "/employees", label: "Employees" },
  { href: "/timesheet", label: "Timesheet" },
  { href: "/reports", label: "Reports & Taxes" },
  { href: "/mileage", label: "Mileage" },
  { href: "/inventory", label: "Inventory" },
  { href: "/backup", label: "Backup" },
];

const ALL_LINKS = [...mainLinks, ...moreLinks];
const byHref = (href: string) => ALL_LINKS.find((link) => link.href === href)!;
export const NAV_GROUPS = [
  { label: "Home", links: ["/dashboard"].map(byHref) },
  { label: "Schedule", links: ["/calendar"].map(byHref) },
  { label: "Clients", links: ["/clients"].map(byHref) },
  { label: "Work", links: ["/inventory"].map(byHref) },
  { label: "Money", links: ["/documents", "/collect", "/reports", "/mileage"].map(byHref) },
  { label: "Team", links: ["/employees", "/timesheet"].map(byHref) },
];
export const BOTTOM_LINKS = [{ href: "/profile", label: "Settings" }, byHref("/backup"), { href: "/help", label: "Help" }];

const QUICK_CREATE = [
  { href: "/invoice", label: "New invoice" },
  { href: "/proposal", label: "New proposal" },
  { href: "/clients", label: "Add client" },
  { href: "/calendar?view=schedule", label: "Schedule" },
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

/**
 * Mobile navigation (under 900px): fixed bottom tab bar, More sheet and quick-create + button.
 * Presentational only: no auth or crew logic. Hidden at 900px+ and in print via CSS.
 * Pass `onLogOut` to show a Log out button in the More sheet's Settings group.
 */
export default function MobileNav({ onLogOut }: { onLogOut?: () => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  return (
      <div className="min-[900px]:hidden print:hidden">
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
                    const isSettings = group.label === "Settings";
                    const links = group.links.filter((link) => !TAB_HREFS.includes(link.href));
                    if (!links.length) return null;
                    return (
                      <div key={group.label}>
                        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)]">{group.label}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {links.map((link) => (
                            <a key={link.href} href={link.href} className="flex min-h-11 items-center rounded-xl border border-teal-500/20 bg-[var(--cr-card)] px-4 py-3 text-sm font-medium transition hover:border-teal-400">
                              {link.label}
                            </a>
                          ))}
                          {isSettings && onLogOut && (
                            <button type="button" onClick={onLogOut} className="min-h-11 rounded-xl border border-rose-500/30 bg-[var(--cr-card)] px-4 py-3 text-left text-sm font-medium text-rose-600 transition hover:border-rose-400 dark:text-rose-300">
                              Log out
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {createOpen && !moreOpen && <div className="fixed inset-0 z-40 bg-slate-950/50 print:hidden" onClick={() => setCreateOpen(false)} />}
          <div className={`quick-create-fab fixed right-4 ${moreOpen || !createOpen ? "hidden" : ""} bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 print:hidden`}>
            {createOpen && (
              <div className="w-48 overflow-hidden rounded-2xl border border-teal-500/20 bg-[var(--cr-panel)] py-1 shadow-2xl">
                {QUICK_CREATE.map((item) => (
                  <a key={item.href} href={item.href} className="flex min-h-11 items-center px-4 py-3 text-sm font-medium transition hover:bg-teal-500/10">
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t border-teal-500/20 bg-[var(--cr-panel)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden">
            <div className="mx-auto grid max-w-lg grid-cols-6">
              {mainLinks.filter((link) => TAB_HREFS.includes(link.href)).map((link) => (
                <a key={link.href} href={link.href} className="flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition hover:text-teal-700 dark:hover:text-teal-300">
                  <TabIcon name={link.href} />
                  {link.href === "/dashboard" ? "Home" : link.label}
                </a>
              ))}
              {/* R124: + lives in the tab bar, so it never covers page buttons. */}
              <button
                type="button"
                aria-label="Quick create"
                aria-expanded={createOpen}
                data-testid="quick-create"
                onClick={() => { setMoreOpen(false); setCreateOpen(!createOpen); }}
                className="flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-semibold text-teal-700 dark:text-teal-300"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500 text-slate-950!"><svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${createOpen ? "rotate-45" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
                New
              </button>
              <button
                type="button"
                aria-expanded={moreOpen}
                onClick={() => { setCreateOpen(false); setMoreOpen(!moreOpen); }}
                className={`relative flex flex-col items-center gap-1 px-1 py-2.5 text-[11px] font-medium transition hover:text-teal-700 dark:hover:text-teal-300 ${moreOpen ? "text-teal-700 dark:text-teal-300" : ""}`}
              >
                {moreOpen && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-teal-400" />}
                <TabIcon name="more" />
                More
              </button>
            </div>
          </nav>
      </div>
  );
}
