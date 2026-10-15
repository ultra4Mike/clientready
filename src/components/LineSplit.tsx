import { lineSplit } from "@/lib/line-split";

/** Compact "Labor / Materials / Other" summary for the customer copy. */
export default function LineSplit({ items, labelClass = "text-slate-500" }: { items: { qty?: unknown; rate?: unknown; category?: unknown }[]; labelClass?: string }) {
  const split = lineSplit(items);
  if (!split) return null;
  const rows = ([["Labor", split.labor], ["Materials", split.materials], ["Other", split.other]] as [string, number][]).filter(([, amount]) => amount > 0);
  if (!rows.length) return null;
  return (
    <div className="space-y-1 pb-1.5" data-testid="line-split">
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
