"use client";

import { Children, createContext, useContext, useEffect, useId, useSyncExternalStore, type ReactNode } from "react";

/**
 * Collapsible form section. The first child is the section header and always stays visible (unless
 * headerFirst is false, then `label` is shown while collapsed). A chevron button collapses the rest;
 * collapsed content stays mounted (only hidden), so nothing typed is lost and no logic changes.
 * Open/closed is remembered per section on this device (localStorage).
 * Hooks: data-section, data-collapsed on the wrapper; data-testid="section-toggle" on the button.
 */
const KEY = "clientready-invoice-sections";
const EVENT = "clientready-sections";

function readPrefs(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
};
const prefsSnapshot = () => window.localStorage.getItem(KEY) || "{}";

/** Defaults: which sections start collapsed when the user hasn't chosen; `scoped` sections remember new vs existing documents separately. */
export const SectionDefaults = createContext<{ collapsed: string[]; scope: string; scoped?: string[] }>({ collapsed: [], scope: "" });

/**
 * True when the page was opened on an existing document (?id= or the open-document hand-off).
 * Decided once per page visit, so saving a new document (which adds ?id=) doesn't fold sections.
 */
let openedExisting: boolean | null = null;
export function useOpenedExisting() {
  useEffect(() => () => {
    openedExisting = null;
  }, []);
  return useSyncExternalStore(
    () => () => {},
    () => (openedExisting ??= new URLSearchParams(window.location.search).has("id") || Boolean(window.localStorage.getItem("clientready-open-document"))),
    () => false
  );
}

export default function Section({ id, label, summary, className = "", testId, headerFirst = true, forceOpen = false, children }: {
  id: string;
  label: string;
  summary?: ReactNode;
  className?: string;
  testId?: string;
  headerFirst?: boolean;
  /** Show the body even if the user collapsed it (e.g. ?focus=checklist). */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const defaults = useContext(SectionDefaults);
  const prefKey = defaults.scope && defaults.scoped?.includes(id) ? `${id}:${defaults.scope}` : id;
  const raw = useSyncExternalStore(subscribe, prefsSnapshot, () => "{}");
  let stored: boolean | undefined;
  try {
    stored = (JSON.parse(raw) as Record<string, boolean>)[prefKey];
  } catch {
    stored = undefined;
  }
  const collapsed = forceOpen ? false : stored ?? defaults.collapsed.includes(id);
  const bodyId = useId();
  const items = Children.toArray(children);
  const header = headerFirst ? items[0] : null;
  const body = headerFirst ? items.slice(1) : items;

  function toggle() {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), [prefKey]: !collapsed }));
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div className={`cr-section relative ${className}`} data-section={id} data-collapsed={collapsed ? "true" : "false"} data-testid={testId}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
        data-testid="section-toggle"
        className="print-hide cr-section-toggle absolute right-3 top-3 z-10 sm:right-4 sm:top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--cr-muted)] transition hover:text-teal-500 max-sm:h-11 max-sm:w-11"
      >
        <span aria-hidden="true" className={`text-lg leading-none transition ${collapsed ? "" : "rotate-90"}`}>›</span>
      </button>
      {header && <div className="cr-section-head flex min-h-8 items-center pr-10 max-sm:min-h-11 max-sm:pr-12">{header}</div>}
      {!header && collapsed && <div className="cr-section-head flex min-h-8 items-center pr-10 max-sm:min-h-11 max-sm:pr-12"><p className="cr-section-label">{label}</p></div>}
      {collapsed && summary && <div className="pr-10 text-sm text-[var(--cr-muted)]" data-testid="section-summary">{summary}</div>}
      <div id={bodyId} hidden={collapsed} className={headerFirst ? "space-y-3" : ""}>
        {body}
      </div>
    </div>
  );
}
