"use client";
import { useEffect, useState } from "react";
import { applyPortalTheme, PORTAL_THEME_KEY, type PortalTheme } from "@/lib/portal-theme";

export default function PortalThemeToggle() {
  const [choice, setChoice] = useState<PortalTheme>("system");
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = window.localStorage.getItem(PORTAL_THEME_KEY);
      const c: PortalTheme = saved === "light" || saved === "dark" ? saved : "system";
      setChoice(c);
      applyPortalTheme(c);
    }, 0);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => { if ((window.localStorage.getItem(PORTAL_THEME_KEY) || "system") === "system") applyPortalTheme("system"); };
    mq?.addEventListener?.("change", onChange);
    return () => { clearTimeout(t); mq?.removeEventListener?.("change", onChange); };
  }, []);
  return (
    <label className="print:hidden fixed right-3 top-3 z-40 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm" data-testid="portal-theme">
      <span className="sr-only">Theme</span>
      <select aria-label="Theme" className="bg-transparent outline-none" value={choice} onChange={(e) => { const c = e.target.value as PortalTheme; setChoice(c); applyPortalTheme(c); }}>
        <option value="system">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
