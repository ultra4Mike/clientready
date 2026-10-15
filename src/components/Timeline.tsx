/**
 * Timeline: presentational vertical activity feed with type icons and status pills.
 *
 * @example
 * <Timeline items={[
 *   { date: "Oct 14", type: "invoice", title: "Invoice #1042 sent", amount: 450, status: "sent", href: "/invoice?id=1" },
 *   { date: "Oct 12", type: "payment", title: "Payment received", amount: 200, status: "paid" },
 * ]} />
 *
 * `type`: invoice | proposal | payment | job | note | email (others get a dot).
 * `status`: free text; paid/approved/done read green, overdue/declined red, sent/scheduled teal, else neutral.
 */
/** `attrs`: optional data-* hooks put on the row (no visual effect). */
export type TimelineItem = { date: string; type: string; title: string; amount?: number; status?: string; href?: string; attrs?: Record<string, string> };

const ICONS: Record<string, string> = { invoice: "🧾", proposal: "📝", payment: "💵", job: "🛠️", note: "🗒️", email: "✉️" };

function pill(status: string) {
  const s = status.toLowerCase();
  if (["paid", "approved", "done", "completed", "accepted"].includes(s)) return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (["overdue", "declined", "failed", "cancelled", "canceled"].includes(s)) return "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (["sent", "scheduled", "in progress", "viewed"].includes(s)) return "border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300";
  return "border-slate-500/30 bg-slate-500/10 text-[var(--cr-muted)]";
}

export default function Timeline({ items, emptyText = "No activity yet." }: { items: TimelineItem[]; emptyText?: string }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-teal-500/30 p-6 text-center text-sm text-[var(--cr-muted)]">{emptyText}</p>;
  return (
    <ol className="relative space-y-1">
      <span aria-hidden="true" className="absolute top-3 bottom-3 left-[1.125rem] w-px bg-teal-500/20" />
      {items.map((item, i) => {
        const body = (
          <>
            <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-500/25 bg-[var(--cr-card)] text-base">{ICONS[item.type] || "•"}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                {item.status && <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${pill(item.status)}`}>{item.status}</span>}
              </div>
              <p className="text-xs text-[var(--cr-muted)]">{item.date}</p>
            </div>
            {typeof item.amount === "number" && <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums">${item.amount.toFixed(2)}</span>}
          </>
        );
        return (
          <li key={`${item.date}-${item.title}-${i}`} {...item.attrs}>
            {item.href ? (
              <a href={item.href} className="flex items-start gap-3 rounded-xl p-1.5 transition hover:bg-teal-500/5">{body}</a>
            ) : (
              <div className="flex items-start gap-3 p-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
