"use client";
/** Timesheet rules (gap, "Still driving?" timeout, half day) + the read-only pay start day. Lives on the crew/pay page. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadOwnerTimesheet, readLocalTimesheetSettings, saveTimesheetSettings } from "@/lib/day-events";
import { DEFAULT_TIMESHEET_SETTINGS, type TimesheetSettings } from "@/lib/timesheet";
import { syncTimesheetCutover, addDays } from "@/lib/timesheet-sync";
import { weekOf } from "@/lib/pay-types";

export default function TimesheetRules() {
  const [settings, setSettings] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [cutover, setCutover] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void syncTimesheetCutover().then((day) => { if (live) { setCutover(day); setSettings(readLocalTimesheetSettings()); } });
    const wk = weekOf(new Date().toISOString().slice(0, 10));
    void loadOwnerTimesheet(wk, addDays(wk, 6)).then((d) => { if (live) setSettings(d.settings); });
    return () => { live = false; };
  }, []);
  return (
    <details className="mt-4 rounded-lg border border-teal-500/20 p-3 text-sm" data-testid="ts-settings">
      <summary className="cursor-pointer font-semibold">Timesheet rules</summary>
      {cutover && <p className="mt-2 text-[var(--cr-muted)]" data-testid="ts-cutover">Timesheet pay starts on {new Date(`${cutover}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <label>Unpaid gap over (min)<input data-testid="ts-gap" id="ts-gap" name="gapMinutes" className="mt-1 block min-h-11 w-full rounded border bg-transparent px-2" inputMode="numeric" value={settings.gapMinutes} onChange={(e) => setSettings({ ...settings, gapMinutes: Number(e.target.value) || 0 })} /></label>
        <label>“Still driving?” after (min)<input data-testid="ts-timeout" id="ts-timeout" name="transitTimeoutMinutes" className="mt-1 block min-h-11 w-full rounded border bg-transparent px-2" inputMode="numeric" value={settings.transitTimeoutMinutes} onChange={(e) => setSettings({ ...settings, transitTimeoutMinutes: Number(e.target.value) || 0 })} /></label>
        <label>Half day under (h)<input data-testid="ts-halfday" id="ts-halfday" name="halfDayHours" className="mt-1 block min-h-11 w-full rounded border bg-transparent px-2" inputMode="decimal" value={settings.halfDayHours} onChange={(e) => setSettings({ ...settings, halfDayHours: Number(e.target.value) || 0 })} /></label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="min-h-11 rounded-lg border px-3" data-testid="ts-settings-save" onClick={() => { void saveTimesheetSettings(settings); setMessage("Rules saved."); }}>Save rules</button>
        <Link href="/help?a=timesheet-how-counted" className="underline" data-testid="ts-rules-help">How hours are counted</Link>
        {message && <span role="status" data-testid="ts-settings-message">{message}</span>}
      </div>
    </details>
  );
}
