"use client";

import { useEffect, useState } from "react";
import { loadOwnerTimesheet, readLocalTimesheetSettings, saveTimesheetSettings } from "@/lib/day-events";
import { type TimesheetSettings } from "@/lib/timesheet";
import { addDays } from "@/lib/timesheet-sync";
import { weekOf } from "@/lib/pay-types";
import OvertimeRulesFields, { OT_KEYS, mergeOt } from "@/components/timesheet/OvertimeRulesFields";

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Settings > Overtime: account-wide overtime rules (same rules as Employees > Timesheet rules). Owner-only page. */
export default function OvertimeSettingsCard() {
  const [settings, setSettings] = useState<TimesheetSettings>(() => readLocalTimesheetSettings());
  const [saved, setSaved] = useState<TimesheetSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true; const wk = weekOf(today());
    void loadOwnerTimesheet(wk, addDays(wk, 6)).then((d) => { if (live) { setSettings(d.settings); setSaved(d.settings); } }).catch(() => {});
    return () => { live = false; };
  }, []);
  const set = (patch: Partial<TimesheetSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const dirty = OT_KEYS.some((k) => JSON.stringify(settings[k]) !== JSON.stringify(saved[k]));
  async function save() {
    setBusy(true);
    const next = mergeOt(saved, settings);
    try { await saveTimesheetSettings(next, saved); setSaved(next); setSettings(next); setMessage("Overtime rules saved."); }
    catch { setMessage("Saved on this device; will sync when online."); }
    setBusy(false);
  }
  return (
    <section id="overtime" className="scroll-mt-24 mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6" data-testid="settings-ot">
      <h2 className="text-lg font-bold tracking-tight">Overtime</h2>
      <p className="mt-1 text-[var(--cr-muted)]">For your whole account. Workers never see other people&apos;s pay.</p>
      <OvertimeRulesFields settings={settings} set={set} p="set" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="cr-btn cr-btn-primary" data-testid="set-ot-save" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save overtime"}</button>
        {dirty && <button type="button" className="cr-btn cr-btn-text" data-testid="set-ot-reset" onClick={() => setSettings(saved)}>Discard</button>}
        {message && <span role="status" data-testid="set-ot-message">{message}</span>}
      </div>
    </section>
  );
}
