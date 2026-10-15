/**
 * Checklist: presentational "Getting started" card with a progress ring.
 *
 * @example
 * <Checklist title="Get set up" items={[
 *   { label: "Add your business info", done: true, href: "/profile" },
 *   { label: "Add a client", done: false, href: "/clients" },
 *   { label: "Send your first invoice", done: false, href: "/invoice" },
 * ]} />
 */
export type ChecklistItem = { label: string; done: boolean; href?: string };

export default function Checklist({ items, title = "Getting started", subtitle }: { items: ChecklistItem[]; title?: string; subtitle?: string }) {
  const done = items.filter((item) => item.done).length;
  const ratio = items.length ? done / items.length : 0;
  const r = 20;
  const c = 2 * Math.PI * r;

  return (
    <section className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5 print:hidden">
      <div className="flex items-center gap-4">
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90" aria-hidden="true">
            <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-slate-500/20" />
            <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-teal-500 transition-all" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{done}/{items.length}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-[var(--cr-muted)]">{subtitle || (done === items.length ? "All set. Nice work!" : `${items.length - done} step${items.length - done === 1 ? "" : "s"} left`)}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-teal-500/10">
        {items.map((item) => {
          const row = (
            <>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${item.done ? "border-teal-500 bg-teal-500 text-slate-950!" : "border-slate-500/50"}`}>{item.done ? "✓" : ""}</span>
              <span className={`flex-1 text-sm ${item.done ? "text-[var(--cr-muted)] line-through" : "font-medium"}`}>{item.label}</span>
              {item.href && !item.done && <span aria-hidden="true" className="text-[var(--cr-muted)]">›</span>}
            </>
          );
          return (
            <li key={item.label}>
              {item.href && !item.done ? (
                <a href={item.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-teal-500/10">{row}</a>
              ) : (
                <div className="flex items-center gap-3 py-2.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
