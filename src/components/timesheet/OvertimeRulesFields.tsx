"use client";

import { type TimesheetSettings } from "@/lib/timesheet";
import { multWords, otRules, otSummary } from "@/lib/overtime-rules";
import { useState } from "react";

const field = "mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2 tabular-nums";

export const OT_KEYS = ["otPreset", "weeklyOtHours", "dailyOtHours", "dailyDtHours", "seventhDayRule", "bonusInRegularRate", "otMultiplier", "dtMultiplier", "otCountPto", "otCountSick", "otCountHoliday"] as const;
/** Only the overtime keys from `ot` go on top of the latest full rules (Settings card never overwrites other rules). */
export function mergeOt(latest: TimesheetSettings, ot: TimesheetSettings): TimesheetSettings {
  const out = { ...latest } as Record<string, unknown>;
  for (const k of OT_KEYS) out[k] = ot[k];
  return out as TimesheetSettings;
}

/** One-tap presets. US standard = 1.5x after 40 h a week; California = 1.5x after 8 h/day or 40 h/week, 2x after 12 h/day, 7th day. */
export const OT_PRESETS = {
  off: { otPreset: "worker" },
  us: { otPreset: "federal", weeklyOtHours: 40, dailyOtHours: 0, dailyDtHours: 0, seventhDayRule: false, otMultiplier: 1.5, dtMultiplier: 2 },
  california: { otPreset: "california", weeklyOtHours: 40, dailyOtHours: 8, dailyDtHours: 12, seventhDayRule: true, otMultiplier: 1.5, dtMultiplier: 2 },
} satisfies Record<string, Partial<TimesheetSettings>>;

/** Editing any value turns a preset into Custom, starting from what the preset paid (so nothing jumps). */
export function otEdit(s: TimesheetSettings, patch: Partial<TimesheetSettings>): Partial<TimesheetSettings> {
  const r = otRules(s);
  const base: Partial<TimesheetSettings> = r && s.otPreset !== "custom" ? { weeklyOtHours: r.weekly, dailyOtHours: r.daily, dailyDtHours: r.double, seventhDayRule: r.seventh, otMultiplier: r.mult ?? 1.5, dtMultiplier: r.dtMult ?? 2 } : {};
  return { ...base, ...patch, otPreset: "custom" };
}

/** Multiplier picker: Time and a half / Double time / Custom (any positive decimal, e.g. 1.25 or 1.75). */
export function MultiplierPicker({ value, onChange, id, label }: { value: number; onChange: (n: number) => void; id: string; label: string }) {
  // Once the owner picks Custom or types a multiplier, the picker stays on Custom (even at 1.5 or 2) instead of snapping back to a preset name.
  const [edited, setEdited] = useState(false);
  const preset = edited ? "custom" : value === 1.5 ? "1.5" : value === 2 ? "2" : "custom";
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="cr-field-label font-medium">{label}</label>
      <select id={id} name={id} data-testid={id} className={field} value={preset} onChange={(e) => { const custom = e.target.value === "custom"; setEdited(custom); onChange(custom ? (value === 1.5 || value === 2 ? 1.25 : value) : Number(e.target.value)); }}>
        <option value="1.5">Time and a half (1.5x)</option><option value="2">Double time (2x)</option><option value="custom">Custom…</option>
      </select>
      {preset === "custom" && <input aria-label={`${label} (custom)`} data-testid={`${id}-custom`} className={field} inputMode="decimal" defaultValue={String(value)} onChange={(e) => { setEdited(true); const n = Number(e.target.value); if (Number.isFinite(n) && n > 0) onChange(n); }} />}
      <span className="text-xs text-[var(--cr-muted)]" data-testid={`${id}-words`}>{multWords(value)}</span>
    </div>
  );
}

/** Account-wide overtime. Shared by Team > Timesheet rules and Settings > Overtime. `p` prefixes test ids. */
export default function OvertimeRulesFields({ settings, set, p = "ts" }: { settings: TimesheetSettings; set: (patch: Partial<TimesheetSettings>) => void; p?: string }) {
  const on = settings.otPreset !== "worker";
  const r = otRules(settings);
  const edit = (patch: Partial<TimesheetSettings>) => set(otEdit(settings, patch));
  const numIn = (label: string, id: string, value: number, apply: (n: number) => void, help?: string) => (
    <label className="block text-sm"><span className="cr-field-label font-medium">{label}</span>
      <input data-testid={id} name={id} className={field} inputMode="decimal" value={value ? String(value) : ""} placeholder="Off" onChange={(e) => apply(Math.max(0, Number(e.target.value) || 0))} />
      {help && <span className="text-xs text-[var(--cr-muted)]">{help}</span>}</label>
  );
  const chk = (label: string, id: string, checked: boolean, apply: (v: boolean) => void) => (
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={id} data-testid={id} checked={checked} onChange={(e) => apply(e.target.checked)} />{label}</label>
  );
  return (
    <>
      {chk("Pay overtime", `${p}-ot-on`, on, (v) => set(v ? OT_PRESETS.us as Partial<TimesheetSettings> : OT_PRESETS.off as Partial<TimesheetSettings>))}
      {on && <>
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Overtime shortcuts">
          <button type="button" className="cr-btn cr-btn-secondary" data-testid={`${p}-ot-us`} aria-pressed={settings.otPreset === "federal"} onClick={() => set(OT_PRESETS.us as Partial<TimesheetSettings>)}>US standard</button>
          <button type="button" className="cr-btn cr-btn-secondary" data-testid={`${p}-ot-california`} aria-pressed={settings.otPreset === "california"} onClick={() => set(OT_PRESETS.california as Partial<TimesheetSettings>)}>California</button>
          {settings.otPreset === "custom" && <span className="inline-flex min-h-11 items-center rounded-lg border border-teal-500 bg-teal-500/10 px-3 text-sm font-medium" data-testid={`${p}-ot-custom-tag`} aria-current="true">Custom</span>}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {numIn("Overtime starts after (hours per week)", `${p}-ot-weekly`, r?.weekly || 0, (n) => edit({ weeklyOtHours: n }), "Any number, e.g. 40, 38 or 44.")}
          <MultiplierPicker id={`${p}-ot-mult`} label="Overtime pay" value={r?.mult ?? 1.5} onChange={(n) => edit({ otMultiplier: n })} />
          {numIn("Also after (hours in one day, optional)", `${p}-ot-daily`, r?.daily || 0, (n) => edit({ dailyOtHours: n }))}
          {numIn("Second tier after (hours in one day, optional)", `${p}-dt-daily`, r?.double || 0, (n) => edit({ dailyDtHours: n }), "For example California: 2x after 12 h a day.")}
          {(r?.double || 0) > 0 && <MultiplierPicker id={`${p}-dt-mult`} label="Second tier pay" value={r?.dtMult ?? 2} onChange={(n) => edit({ dtMultiplier: n })} />}
          {chk("7th day in a row rule (California)", `${p}-seventh-day`, Boolean(r?.seventh), (v) => edit({ seventhDayRule: v }))}
        </div>
        <fieldset className="mt-2" data-testid={`${p}-ot-count-off`}>
          <legend className="text-sm font-medium">Count paid time off toward overtime hours</legend>
          <div className="flex flex-wrap gap-x-4">
            {chk("PTO", `${p}-ot-count-pto`, settings.otCountPto, (v) => set({ otCountPto: v }))}
            {chk("Sick", `${p}-ot-count-sick`, settings.otCountSick, (v) => set({ otCountSick: v }))}
            {chk("Holiday", `${p}-ot-count-holiday`, settings.otCountHoliday, (v) => set({ otCountHoliday: v }))}
          </div>
          <p className="text-xs text-[var(--cr-muted)]">Off matches US federal law, where only hours worked count. When on, those hours count toward the weekly threshold but are paid at the normal rate, never the overtime rate.</p>
        </fieldset>
        {chk("Include job bonuses in the overtime rate (FLSA)", `${p}-bonus-regular`, settings.bonusInRegularRate, (v) => set({ bonusInRegularRate: v }))}
      </>}
      <p className="mt-1 text-xs text-[var(--cr-muted)]" data-testid={`${p}-ot-worker-note`}>Every worker uses these rules unless you untick Use account overtime rules on their page. Day-rate and piece-rate overtime is a separate switch (off by default).</p>
      <p className="cr-preview mt-2 text-sm text-[var(--cr-muted)]" data-testid={`${p}-preview-ot`}>{otSummary(settings)}{on && (settings.otCountPto || settings.otCountSick || settings.otCountHoliday) ? ` ${[settings.otCountPto && "PTO", settings.otCountSick && "sick", settings.otCountHoliday && "holiday"].filter(Boolean).join(" and ")} hours count toward the weekly threshold.` : ""}</p>
    </>
  );
}
