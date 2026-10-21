import type { JobProfit } from "@/lib/job-profit";

/** The same per-job profit table on the invoice, in Reports and in the Year packet. Owner only. */
export function JobProfitBreakdown({ profit, testid = "job-profit" }: { profit: JobProfit; testid?: string }) {
  const usd = (n: number) => `$${n.toFixed(2)}`;
  return (
    <table className="w-full text-sm tabular-nums" data-testid={testid} data-cost={profit.cost.toFixed(2)} data-profit={profit.profit.toFixed(2)}>
      <tbody>
        <tr><td className="py-1.5 font-medium">You charge</td><td className="py-1.5 text-right font-medium">{usd(profit.total)}</td></tr>
        {profit.lines.map((line) => (
          <tr key={line.key} data-testid="job-profit-line" data-key={line.key} className="text-slate-600 dark:text-slate-300"><td className="py-1 pl-3">− {line.label}</td><td className="py-1 text-right">{usd(line.amount)}</td></tr>
        ))}
        {!profit.lines.length && <tr className="text-slate-500"><td className="py-0.5 pl-3" colSpan={2}>No costs entered yet</td></tr>}
        <tr className={`border-t-2 border-slate-300 text-base font-bold ${profit.profit < 0 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          <td className="pt-2">Profit after all costs{profit.margin !== null ? ` (${profit.margin}%)` : ""}</td><td className="pt-2 text-right" data-testid={`${testid}-total`}>{usd(profit.profit)}</td>
        </tr>
      </tbody>
    </table>
  );
}
