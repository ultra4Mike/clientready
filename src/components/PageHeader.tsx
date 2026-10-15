import type { ReactNode } from "react";

/** Presentational page header: title + optional subtitle on the left, actions on the right (stacks on phones). */
export default function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div data-page-header className="print-hide mb-6 flex flex-col gap-4 border-b border-teal-500/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">{eyebrow}</div>}
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {subtitle && <div className="mt-1 text-sm text-[var(--cr-muted)] sm:text-base">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** Presentational section card with a small titled header. */
export function SectionCard({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
