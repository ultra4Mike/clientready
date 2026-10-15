import { lineSplit } from "@/lib/line-split";

/** Labor / Materials summary for the customer copy (billed amounts only, never owner costs). */
export default function LineSplit({ items, labelClass = "text-slate-500" }: { items: { qty?: unknown; rate?: unknown; category?: unknown }[]; labelClass?: string }) {
  const split = lineSplit(items);
  if (!split) return null;
  const rows: [string, string, number][] = [["labor", "Labor", split.labor], ["materials", "Materials", split.materials]];
  if (split.other > 0) rows.push(["other", "Other (not marked)", split.other]);
  const total = split.labor + split.materials + split.other;
  return (
    <div className="space-y-1 pb-1.5" data-testid="line-split">
      <p className={`text-xs ${labelClass}`}>Labor and materials (before discount and tax)</p>
      {rows.map(([key, label, amount]) => (
        <div key={key} className="flex justify-between gap-2" data-testid={`split-${key}`}>
          <span>{label}</span>
          <span>${amount.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-current/20 pt-1 font-semibold" data-testid="split-total">
        <span>Items total</span>
        <span>${total.toFixed(2)}</span>
      </div>
    </div>
  );
}
