"use client";

import { CA_SICK, type TimesheetSettings } from "@/lib/timesheet";

const field = "mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2 tabular-nums";

export const PTO_KEYS = ["ptoPreset", "ptoAllowNegative", "ptoPerHours", "ptoCapHours", "ptoUseCapHours", "ptoWaitDays", "ptoDayHours", "ptoRequestsOn", "otCountHoliday"] as const;
/** Only the PTO keys from `pto` go on top of the latest full rules, so other timesheet rules are never overwritten. */
export function mergePto(latest: TimesheetSettings, pto: TimesheetSettings): TimesheetSettings {
  const out = { ...latest } as Record<string, unknown>;
  for (const k of PTO_KEYS) out[k] = pto[k];
  return out as TimesheetSettings;
}

/** Plain-language summary of the PTO rules (exported for tests). */
export function ptoPreview(s: TimesheetSettings) {
  return s.ptoPreset === "off" || !(s.ptoPerHours > 0) ? "No paid time off is earned." : `1 h earned per ${s.ptoPerHours} h worked${s.ptoCapHours ? `, up to ${s.ptoCapHours} h` : ""}${s.ptoUseCapHours ? `, ${s.ptoUseCapHours} h usable a year` : ""}${s.ptoWaitDays ? `, after ${s.ptoWaitDays} days` : ""}.`;
}

/** Patch for a preset pick (California fills the sick-leave numbers; Off/Federal stop accrual). */
export function ptoPresetPatch(v: TimesheetSettings["ptoPreset"]): Partial<TimesheetSettings> {
  return v === "california" ? { ptoPreset: v, ...CA_SICK } : v === "off" || v === "federal" ? { ptoPreset: v, ptoPerHours: 0 } : { ptoPreset: v };
}

/** Account-wide PTO / sick rules. Shared by Team > Timesheet rules and Settings > Time off. `p` prefixes test ids. */
export default function PtoRulesFields({ settings, set, p = "ts", account = false }: { settings: TimesheetSettings; set: (patch: Partial<TimesheetSettings>) => void; p?: string; account?: boolean }) {
  const num = (k: keyof TimesheetSettings, label: string, id: string) => (
    <label className="block text-sm"><span className="cr-field-label font-medium">{label}</span>
      <input data-testid={id} id={id} name={String(k)} className={field} inputMode="decimal" value={String(settings[k] ?? "")} onChange={(e) => set({ [k]: Number(e.target.value) || 0 } as Partial<TimesheetSettings>)} /></label>
  );
  const tog = (k: keyof TimesheetSettings, label: string, id: string) => (
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={id} data-testid={id} checked={Boolean(settings[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<TimesheetSettings>)} />{label}</label>
  );
  return (
    <>
      <label className="mt-2 block text-sm"><span className="font-medium">Rules</span>
        <select name={`${p}-pto-preset`} data-testid={`${p}-pto-preset`} className={field} value={settings.ptoPreset} onChange={(e) => set(ptoPresetPatch(e.target.value as TimesheetSettings["ptoPreset"]))}>
          <option value="off">Off</option><option value="federal">Federal (no paid leave required)</option><option value="california">California sick leave (1 h per 30 h, cap 80, use 40, after 90 days)</option><option value="custom">Custom</option>
        </select></label>
      {settings.ptoPreset === "custom" && <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {num("ptoPerHours", "1 h earned per … h worked", `${p}-pto-per`)}
        {num("ptoCapHours", "Most hours that can build up (0 = no cap)", `${p}-pto-cap`)}
        {num("ptoUseCapHours", "Most hours usable per year (0 = no cap)", `${p}-pto-use-cap`)}
        {num("ptoWaitDays", "Usable after … days from hire", `${p}-pto-wait`)}
      </div>}
      {settings.ptoPreset !== "off" && settings.ptoPreset !== "federal" && <div className="mt-2">{tog("ptoAllowNegative", "Let workers ask for more than they have (negative balance)", `${p}-pto-negative`)}</div>}
      {account && <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {num("ptoDayHours", "Hours in one day off", `${p}-pto-day-hours`)}
        {tog("ptoRequestsOn", "Workers can ask for time off in the crew app", `${p}-pto-requests-on`)}
      </div>}
      {account && <fieldset className="mt-3 rounded-lg border p-2" data-testid={`${p}-leave-types`}>
        <legend className="px-1 text-sm font-medium">Leave types</legend>
        <ul className="space-y-1 text-sm">
          <li data-testid={`${p}-leave-pto`}><b>PTO</b>: comes out of the balance above. Workers can ask for it when requests are on.</li>
          <li data-testid={`${p}-leave-sick`}><b>Sick</b>: comes out of the same balance.</li>
          <li data-testid={`${p}-leave-holiday`}><b>Holiday</b>: paid at the worker&apos;s normal rate. Only you (the owner) add it, from Timesheet or a worker&apos;s page. It never comes out of the PTO balance.</li>
        </ul>
        {tog("otCountHoliday", "Count holiday hours toward overtime", `${p}-pto-count-holiday`)}
      </fieldset>}
      <p className="mt-1 text-xs text-[var(--cr-muted)]" data-testid={`${p}-pto-worker-note`}>Each worker uses these rules. On a worker&apos;s page, leave the PTO fields blank to keep them, or set their own rate / starting hours / off.</p>
      <p className="cr-preview mt-2 text-sm text-[var(--cr-muted)]" data-testid={`${p}-preview-pto`}>{ptoPreview(settings)}</p>
    </>
  );
}
