// Client-facing pages (/portal, /approve, /collect, /receipt) follow the visitor's own choice,
// else their device (prefers-color-scheme). Kept separate from the owner's app theme key.
export const PORTAL_THEME_KEY = "clientready-portal-theme";
export type PortalTheme = "system" | "light" | "dark";
export const PORTAL_PATH_RE = /^\/(approve|portal|receipt|collect)(\/|$)/;

export function resolvePortalTheme(saved: string | null | undefined, prefersDark: boolean): "light" | "dark" {
  if (saved === "light" || saved === "dark") return saved;
  return prefersDark ? "dark" : "light";
}

export function applyPortalTheme(choice: PortalTheme) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(PORTAL_THEME_KEY, choice); } catch {}
  const t = resolvePortalTheme(choice, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const r = document.documentElement;
  r.classList.toggle("dark", t === "dark");
  r.classList.toggle("light", t === "light");
}
