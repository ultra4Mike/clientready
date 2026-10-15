import { lineSplit } from "@/lib/line-split";

/** Compact "Labor / Materials / Other" summary for the customer copy. */
export default function LineSplit({ items, labelClass = "text-slate-500" }: { items: { qty?: unknown; rate?: unknown; category?: unknown }[]; labelClass?: string }) {
  const split = lineSplit(items);
  if (!split) return null;
  const rows: [string, number][] = [["Labor", split.labor], ["Materials", split.materials]];
  if (split.other > 0) rows.push(["Other", split.other]);
  return (
    <div className="space-y-0.5 pb-1" data-testid="line-split">
      <p className={`text-xs ${labelClass}`}>Billed by type (before discount and tax)</p>
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-2">
          <span>{label}</span>
          <span>${amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
