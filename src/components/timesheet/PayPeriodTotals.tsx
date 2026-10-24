"use client";
// QA4: the owner's pay period (Settings: weekly / every 2 weeks / twice a month) drives this summary under the week grid.
import { useEffect, useState } from "react";
import { payPeriodOf, type TimesheetSettings } from "@/lib/timesheet";
import { periodPay, TIMESHEET_CHANGED_EVENT } from "@/lib/timesheet-sync";

const usd = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export default function PayPeriodTotals({ week, settings, names }: { week: string; settings: TimesheetSettings; names: Map<string, string> }) {
  const { from, to } = payPeriodOf(week, settings.payPeriod, settings.payPeriodAnchor || "");
  const [rows, setRows] = useState<{ id: string; minutes: number; ptoHours: number; cents: number }[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void periodPay(from, to).then((m) => { if (live) setRows([...m.entries()].map(([id, v]) => ({ id, ...v })).filter((r) => r.minutes || r.ptoHours || r.cents)); }).catch(() => undefined);
    load(); window.addEventListener(TIMESHEET_CHANGED_EVENT, load);
    return () => { live = false; window.removeEventListener(TIMESHEET_CHANGED_EVENT, load); };
  }, [from, to]);
  if (settings.payPeriod === "weekly" || !week) return null;
  const label = settings.payPeriod === "biweekly" ? "Every 2 weeks" : "Twice a month";
  return (
    <section className="cr-panel mb-3 rounded-xl border p-3 text-sm" data-testid="ts-period" data-from={from} data-to={to}>
      <h2 className="font-semibold">Pay period {from} to {to} <span className="font-normal text-[var(--cr-muted)]">({label}; overtime is still per week)</span></h2>
      {!rows ? <p className="text-[var(--cr-muted)]">Loading…</p> : !rows.length ? <p className="text-[var(--cr-muted)]">No hours in this period yet.</p> : (
        <table className="mt-1 w-full tabular-nums"><thead><tr><th className="text-left">Worker</th><th className="text-right">Worked</th><th className="text-right">Time off</th><th className="text-right">Pay</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} data-testid={`ts-period-${r.id}`}><td>{names.get(r.id) || "Former worker"}</td><td className="text-right">{(r.minutes / 60).toFixed(2)} h</td><td className="text-right">{r.ptoHours ? `${r.ptoHours} h` : "—"}</td><td className="text-right">{usd(r.cents)}</td></tr>)}</tbody></table>)}
    </section>
  );
}
