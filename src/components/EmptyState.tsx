import type { ReactNode } from "react";

/** Presentational empty state: icon, title, one line, optional link action. */
export default function EmptyState({ icon = "✦", title, line, actionHref, actionLabel, className = "" }: {
  icon?: ReactNode;
  title: string;
  line?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/10 text-xl text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-300">{icon}</span>
      <p className="mt-4 font-semibold">{title}</p>
      {line && <p className="mt-1 max-w-sm text-sm text-[var(--cr-muted)]">{line}</p>}
      {actionHref && actionLabel && (
        <a href={actionHref} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-teal-500 px-5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">{actionLabel}</a>
      )}
    </div>
  );
}
