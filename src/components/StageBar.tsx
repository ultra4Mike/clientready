"use client";

/**
 * StageBar: presentational horizontal stepper for a job/document pipeline.
 * On phones it collapses to "Step X of N · Stage" with a progress bar.
 *
 * @example
 * <StageBar stages={["Quote", "Scheduled", "In progress", "Invoiced", "Paid"]} current={2}
 *   nextActionLabel="Send invoice" href="/invoice?id=123" />
 *
 * `current` is the zero-based index of the active stage. Provide `onNext` or `href` (not both)
 * together with `nextActionLabel` to show the call-to-action button.
 * Pass `embedded` to drop the card chrome when placing it inside another card (e.g. an editor header).
 */
export default function StageBar({
  stages,
  current,
  nextActionLabel,
  onNext,
  href,
  embedded = false,
}: {
  stages: string[];
  current: number;
  nextActionLabel?: string;
  onNext?: () => void;
  href?: string;
  embedded?: boolean;
}) {
  const index = Math.max(0, Math.min(current, stages.length - 1));
  const pct = stages.length > 1 ? (index / (stages.length - 1)) * 100 : 100;
  const cta = "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm md:min-h-10 md:w-auto font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400";

  return (
    <div className={`print:hidden ${embedded ? "" : "rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <div className="md:hidden">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-teal-700 dark:text-teal-300">{stages[index]}</span>
            <span className="text-xs text-[var(--cr-muted)]">Step {index + 1} of {stages.length}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-500/20">
            <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
          </div>
        </div>

        <ol className="hidden min-w-0 flex-1 items-center md:flex">
          {stages.map((stage, i) => {
            const done = i < index;
            const active = i === index;
            return (
              <li key={stage} className={`flex min-w-0 items-center ${i < stages.length - 1 ? "flex-1" : ""}`} aria-current={active ? "step" : undefined}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${done ? "border-teal-500 bg-teal-500 text-slate-950!" : active ? "border-teal-400 bg-teal-500/20 text-teal-700 ring-4 ring-teal-500/15 dark:text-teal-300" : "border-slate-500/40 text-[var(--cr-muted)]"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={`ml-2 truncate text-sm ${active ? "font-semibold text-teal-700 dark:text-teal-300" : done ? "" : "text-[var(--cr-muted)]"}`}>{stage}</span>
                {i < stages.length - 1 && <span className={`mx-3 h-0.5 min-w-4 flex-1 rounded-full ${done ? "bg-teal-500" : "bg-slate-500/25"}`} />}
              </li>
            );
          })}
        </ol>

        {nextActionLabel && (href ? (
          <a href={href} className={cta}>{nextActionLabel}<span aria-hidden="true">→</span></a>
        ) : onNext ? (
          <button type="button" onClick={onNext} className={cta}>{nextActionLabel}<span aria-hidden="true">→</span></button>
        ) : null)}
      </div>
    </div>
  );
}
