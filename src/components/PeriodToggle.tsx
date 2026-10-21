"use client";

import { PERIODS, type PeriodRange } from "@/lib/period";

/** Day / Week / Month / Year / All time switch. Each button carries data-range; the group carries the current one. */
export default function PeriodToggle({ value, onChange, testid = "period-toggle" }: { value: PeriodRange | ""; onChange: (range: PeriodRange) => void; testid?: string }) {
  return (
    <div role="group" aria-label="Period" data-testid={testid} data-range={value || undefined} className="inline-flex flex-wrap gap-1 rounded-lg border border-teal-500/30 p-1">
      {PERIODS.map(({ range, label }) => (
        <button key={range} type="button" data-range={range} data-testid={`${testid}-${range}`} aria-pressed={value === range} onClick={() => onChange(range)}
          className={`min-h-11 rounded-md px-3 text-sm font-medium sm:min-h-9 ${value === range ? "bg-teal-500 text-slate-950!" : "hover:bg-teal-500/10"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
