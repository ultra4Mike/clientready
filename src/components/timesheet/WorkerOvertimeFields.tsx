"use client";

import type { PaySettings } from "@/lib/pay-types";
import type { TimesheetSettings } from "@/lib/timesheet";
import { otRules, otSummary, usesAccountOvertime } from "@/lib/overtime-rules";
import { MultiplierPicker } from "@/components/timesheet/OvertimeRulesFields";

type Ot = NonNullable<PaySettings["overtime"]>;
const box = "mt-1.5 block min-h-11 w-full rounded-lg border border-teal-500/30 bg-transparent px-2 text-right tabular-nums outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";

/** Team > edit: "Use account overtime rules" by default; Override reveals this worker's own rule. Owner-only form. */
export default function WorkerOvertimeFields({ overtime, account, onChange }: { overtime: PaySettings["overtime"]; account: TimesheetSettings; onChange: (ot: Ot) => void }) {
  const override = !usesAccountOvertime({ overtime }, account.otPreset);
  const r = otRules(account);
  const o: Ot = overtime || { on: false };
  const set = (patch: Partial<Ot>) => onChange({ ...o, ...patch });
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  const text = (label: string, id: string, value: string | undefined, apply: (v: string) => void) => (
    <label className="block text-sm font-medium text-[var(--cr-muted)]">{label}<input name={id} data-testid={id} inputMode="decimal" placeholder="Off" className={box} value={value || ""} onChange={(e) => apply(e.target.value)} /></label>
  );
  return (
    <div data-testid="pay-ot">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="payOtUseAccount" data-testid="pay-ot-use-account" checked={!override}
        onChange={(e) => set(e.target.checked ? { override: false } : { override: true, on: true, weekly: o.weekly || String(r?.weekly || 40), daily: o.daily ?? (r?.daily ? String(r.daily) : ""), multiplier: o.multiplier || String(r?.mult ?? 1.5) })} />Use account overtime rules</label>
      {!override && <p className="text-xs text-[var(--cr-muted)]" data-testid="pay-ot-account-summary">{otSummary(account)}</p>}
      {override && <div className="mt-1 space-y-2" data-testid="pay-ot-override">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="payOtOn" data-testid="pay-ot-on" checked={Boolean(o.on)} onChange={(e) => set({ weekly: "40", multiplier: "1.5", ...o, on: e.target.checked })} />Pay this worker overtime</label>
        {o.on && <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          {text("Overtime starts after (h per week)", "pay-ot-weekly", o.weekly, (v) => set({ weekly: v }))}
          <MultiplierPicker id="pay-ot-multiplier" label="Overtime pay" value={n(o.multiplier, 1.5)} onChange={(x) => set({ multiplier: String(x) })} />
          {text("Also after (h in one day, optional)", "pay-ot-daily", o.daily, (v) => set({ daily: v }))}
          {text("Second tier after (h in one day, optional)", "pay-dt-daily", o.dtDaily, (v) => set({ dtDaily: v }))}
          {n(o.dtDaily, 0) > 0 && <MultiplierPicker id="pay-dt-multiplier" label="Second tier pay" value={n(o.dtMultiplier, 2)} onChange={(x) => set({ dtMultiplier: String(x) })} />}
          <fieldset className="min-[420px]:col-span-2"><legend className="text-sm font-medium">Count paid time off toward overtime hours</legend>
            <div className="flex gap-4">
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-testid="pay-ot-count-pto" checked={Boolean(o.countPto)} onChange={(e) => set({ countPto: e.target.checked })} />PTO</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-testid="pay-ot-count-sick" checked={Boolean(o.countSick)} onChange={(e) => set({ countSick: e.target.checked })} />Sick</label>
            </div>
            <p className="text-xs text-[var(--cr-muted)]" data-testid="pay-ot-count-help">Off matches US federal law, where only hours worked count. When on, those hours count toward the threshold but are paid at the normal rate, not the overtime rate.</p></fieldset>
        </div>}
      </div>}
    </div>
  );
}
