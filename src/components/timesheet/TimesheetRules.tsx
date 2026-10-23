"use client";
/**
 * Team > Timesheet rules: one cr-section card per group (Travel pay, Breaks & meals, Overtime, Rounding, Location,
 * Pay period & reminders), labels above fields, a plain-language preview line under each card.
 * Saving logs the change (audit) and re-applies the current + previous week's pay so jobs, Crew pay, Year packet
 * and Reports follow the new rules. Approved days keep their approved minutes (only OT/premium may change).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { loadOwnerTimesheet, readLocalTimesheetSettings, saveTimesheetSettings } from "@/lib/day-events";
import { CALIFORNIA_RULES, DEFAULT_TIMESHEET_SETTINGS, type TimesheetSettings } from "@/lib/timesheet";
import { syncTimesheetCutover, addDays, readDocs } from "@/lib/timesheet-sync";
import { weekOf } from "@/lib/pay-types";
import TimeAuditLog from "@/components/timesheet/TimeAuditLog";
import PtoRulesFields from "@/components/timesheet/PtoRulesFields";
import OvertimeRulesFields from "@/components/timesheet/OvertimeRulesFields";
import { flsaWords, otSummary } from "@/lib/overtime-rules";

const field = "mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2 tabular-nums";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Plain-language one-liners (exported for tests/help). */
export function rulePreviews(s: TimesheetSettings) {
  const travel = [
    s.startAtShop ? "The day starts when they tap Start day at the shop, so the drive to the first job is paid." : s.payFirstCommute ? "The drive from home to the first job is paid." : "The drive from home to the first job is not paid.",
    s.payLastCommute ? "The drive home is paid." : "The drive home is not paid.",
    `Drives between jobs are paid${s.idleGapPaid ? " (short waits count too)" : " (only logged driving)"}; a gap over ${s.gapMinutes} min is unpaid.`,
    s.commuteDeductMinutes ? `${s.commuteDeductMinutes} min of normal commute is taken off a paid commute.` : "",
    s.longDriveBreakMinutes ? `Drive time past ${s.longDriveBreakMinutes} min is held back as unpaid until you approve it.` : "",
  ].filter(Boolean).join(" ");
  const breaks = `${s.breakPreset === "california" ? "California: 30-min meal before the 5th hour, 10-min rest per 4 hours." : "Federal: no required breaks."} Breaks under ${s.shortBreakPaidMinutes} min are paid, longer ones are unpaid.${s.autoMealOn ? ` A ${s.autoMealMinutes}-min meal is taken off days over ${s.autoMealAfterHours} h with no break logged.` : ""}${s.breakPreset === "california" && s.caPremiumPay ? " A missed meal or rest adds 1 hour of premium pay." : ""}`;
  const ot = otSummary(s);
  const rounding = Number(s.roundingMinutes) === 15 ? "Quarter hour (7-minute rule): 1–7 min rounds down, 8–14 rounds up. Rounds both ways, so it evens out." : s.roundingMinutes ? `Each start and end is rounded to the nearest ${s.roundingMinutes} min (rounds both ways).` : "Exact: paid to the minute, no rounding.";
  const loc = `A tap more than ${s.geofenceMeters} m from the job is flagged (never blocked).${Object.keys(s.jobGeofence).length ? ` ${Object.keys(s.jobGeofence).length} job(s) have their own distance.` : ""}`;
  const period = `${s.payPeriod === "weekly" ? "Paid weekly" : s.payPeriod === "biweekly" ? `Paid every 2 weeks${s.payPeriodAnchor ? ` from ${s.payPeriodAnchor}` : ""}` : "Paid twice a month (1st–15th, 16th–end)"}. Reminders: ${s.remindMissedStartMinutes ? `${s.remindMissedStartMinutes} min after a missed start` : "no missed-start reminder"}, ${s.remindMissedEndMinutes ? `${s.remindMissedEndMinutes} min after a missed end` : "no missed-end reminder"}.`;
  return { travel, breaks, ot, rounding, loc, period };
}

export default function TimesheetRules() {
  const [settings, setSettings] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [saved, setSaved] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [cutover, setCutover] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<{ id: string; label: string }[]>([]);
  const [taskName, setTaskName] = useState(""); const [taskRate, setTaskRate] = useState("");
  const [jobPick, setJobPick] = useState(""); const [jobMeters, setJobMeters] = useState("");
  useEffect(() => {
    let live = true;
    void syncTimesheetCutover().then((day) => { if (live) { setCutover(day); const s = readLocalTimesheetSettings(); setSettings(s); setSaved(s); setJobs(readDocs().filter((d) => d.type !== "proposal").map((d) => ({ id: d.id, label: `${d.clientName || ""} ${d.title || ""}`.trim() || d.id.slice(0, 8) })).slice(0, 300)); } });
    const wk = weekOf(today());
    void loadOwnerTimesheet(wk, addDays(wk, 6)).then((d) => { if (live) { setSettings(d.settings); setSaved(d.settings); } });
    return () => { live = false; };
  }, []);
  const set = (patch: Partial<TimesheetSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const num = (k: keyof TimesheetSettings, label: string, id: string, help?: string) => (
    <label className="block text-sm"><span className="cr-field-label font-medium">{label}</span>
      <input data-testid={id} id={id} name={String(k)} className={field} inputMode="decimal" value={String(settings[k] ?? "")} onChange={(e) => set({ [k]: Number(e.target.value) || 0 } as Partial<TimesheetSettings>)} />
      {help && <span className="text-xs text-[var(--cr-muted)]">{help}</span>}</label>
  );
  const tog = (k: keyof TimesheetSettings, label: string, id: string) => (
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={id} data-testid={id} checked={Boolean(settings[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<TimesheetSettings>)} />{label}</label>
  );
  const p = rulePreviews(settings);
  const preview = (text: string, id: string) => <p className="cr-preview mt-2 text-sm text-[var(--cr-muted)]" data-testid={id}><span data-testid={`ts-preview-line-${id.replace("ts-preview-", "")}`}>{text}</span></p>;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  async function save() {
    setBusy(true);
    try {
      await saveTimesheetSettings(settings, saved);
      setSaved(settings);
      // saveTimesheetSettings re-applies pay and fires TIMESHEET_CHANGED_EVENT itself.
      setMessage("Rules saved. This week's and last week's pay were updated.");
    } catch { setMessage("Saved on this device; will sync when online."); }
    setBusy(false);
  }
  const card = "cr-section mt-3 rounded-lg border p-3";
  return (
    <details className="cr-collapse mt-4 rounded-lg border p-3 text-sm" data-testid="ts-settings">
      <summary className="cursor-pointer font-semibold">Timesheet rules</summary>
      {cutover && <p className="mt-2 text-[var(--cr-muted)]" data-testid="ts-cutover">Timesheet pay starts on {new Date(`${cutover}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}

      <section className={card} data-testid="ts-rules-travel" aria-labelledby="ts-h-travel">
        <h3 id="ts-h-travel" className="cr-section-label font-semibold">Travel pay</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {tog("startAtShop", "Crew report to the shop first (day starts at Start day)", "ts-start-at-shop")}
          {tog("payFirstCommute", "Pay the drive from home to the first job", "ts-pay-first-commute")}
          {tog("payLastCommute", "Pay the drive home from the last job", "ts-pay-last-commute")}
          {tog("idleGapPaid", "Pay short waits between jobs as drive time", "ts-idle-gap-paid")}
          {num("gapMinutes", "Unpaid gap over (min)", "ts-gap")}
          {num("commuteDeductMinutes", "Take off normal commute (min, 0 = off)", "ts-commute-deduct")}
          {num("longDriveBreakMinutes", "Hold back drive time past (min, 0 = off)", "ts-long-drive-break")}
          {num("transitTimeoutMinutes", "“Still driving?” after (min)", "ts-timeout")}
        </div>
        {preview(p.travel, "ts-preview-travel")}
      </section>

      <section className={card} data-testid="ts-rules-breaks" aria-labelledby="ts-h-breaks">
        <h3 id="ts-h-breaks" className="cr-section-label font-semibold">Breaks &amp; meals</h3>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Break rules preset">
          <button type="button" className="cr-btn cr-btn-secondary" data-testid="ts-preset-federal" data-state={settings.breakPreset === "federal" ? "on" : "off"} aria-pressed={settings.breakPreset === "federal"} onClick={() => set({ breakPreset: "federal", caPremiumPay: false, dailyOtHours: 0, dailyDtHours: 0, seventhDayRule: false, ...(settings.otPreset === "california" ? { otPreset: "federal" as const, weeklyOtHours: 40 } : {}) })}>Federal</button>
          <button type="button" className="cr-btn cr-btn-secondary" data-testid="ts-preset-california" data-state={settings.breakPreset === "california" ? "on" : "off"} aria-pressed={settings.breakPreset === "california"} onClick={() => set({ ...CALIFORNIA_RULES, caPremiumPay: true })}>California</button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {num("shortBreakPaidMinutes", "Breaks shorter than this are paid (min)", "ts-short-break")}
          {tog("autoMealOn", "Take off a meal break automatically when none was logged", "ts-auto-meal")}
          {settings.autoMealOn && num("autoMealAfterHours", "…on days longer than (h)", "ts-auto-meal-after")}
          {settings.autoMealOn && num("autoMealMinutes", "Meal length (min)", "ts-auto-meal-minutes")}
          {settings.breakPreset === "california" && tog("caPremiumPay", "Add 1 h premium pay for a missed meal or rest break", "ts-ca-premium")}
          {num("halfDayHours", "Half day under (h, day-rate workers)", "ts-halfday")}
        </div>
        {preview(p.breaks, "ts-preview-breaks")}
      </section>

      <section className={card} data-testid="ts-rules-ot" aria-labelledby="ts-h-ot">
        <h3 id="ts-h-ot" className="cr-section-label font-semibold">Overtime / double time</h3>
        <OvertimeRulesFields settings={settings} set={set} />
      </section>

      <section className={card} data-testid="ts-rules-rounding" aria-labelledby="ts-h-round">
        <h3 id="ts-h-round" className="cr-section-label font-semibold">Rounding</h3>
        <label className="mt-2 block text-sm"><span className="font-medium">Round times to</span>
          <select name="ts-rounding" data-testid="ts-rounding" className={field} value={settings.roundingMinutes} onChange={(e) => set({ roundingMinutes: Number(e.target.value) as TimesheetSettings["roundingMinutes"] })}>
            <option value={0}>Exact (no rounding)</option><option value={5}>5 min</option><option value={6}>6 min (1/10 h)</option><option value={15}>15 min (7-minute rule)</option>
          </select></label>
        {preview(p.rounding, "ts-preview-rounding")}
      </section>

      <section className={card} data-testid="ts-rules-location" aria-labelledby="ts-h-loc">
        <h3 id="ts-h-loc" className="cr-section-label font-semibold">Location</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{num("geofenceMeters", "Job-site distance (meters)", "ts-geofence")}</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block text-sm"><span className="font-medium">Job with its own distance</span>
            <select name="ts-geo-job" data-testid="ts-geo-job" className={field} value={jobPick} onChange={(e) => setJobPick(e.target.value)}><option value="">Pick a job…</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
          <label className="block text-sm"><span className="font-medium">Meters</span><input name="ts-geo-job-meters" data-testid="ts-geo-job-meters" className={field} inputMode="numeric" value={jobMeters} onChange={(e) => setJobMeters(e.target.value)} /></label>
          <button type="button" className="cr-btn cr-btn-secondary" data-testid="ts-geo-job-add" disabled={!jobPick || !(Number(jobMeters) > 0)} onClick={() => { set({ jobGeofence: { ...settings.jobGeofence, [jobPick]: Number(jobMeters) } }); setJobPick(""); setJobMeters(""); }}>Add</button>
        </div>
        {Object.keys(settings.jobGeofence).length > 0 && <ul className="mt-2 space-y-1" data-testid="ts-geo-jobs">{Object.entries(settings.jobGeofence).map(([id, m]) => (
          <li key={id} className="flex items-center gap-2" data-testid={`ts-geo-job-${id}`}><span className="tabular-nums">{jobs.find((j) => j.id === id)?.label || id.slice(0, 8)} · {m} m</span>
            <button type="button" className="cr-btn cr-btn-text" data-testid={`ts-geo-job-remove-${id}`} onClick={() => { const n = { ...settings.jobGeofence }; delete n[id]; set({ jobGeofence: n }); }}>Remove</button></li>))}</ul>}
        {preview(p.loc, "ts-preview-location")}
      </section>

      <section className={card} data-testid="ts-rules-period" aria-labelledby="ts-h-period">
        <h3 id="ts-h-period" className="cr-section-label font-semibold">Pay period &amp; reminders</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm"><span className="font-medium">Pay period</span>
            <select name="ts-pay-period" data-testid="ts-pay-period" className={field} value={settings.payPeriod} onChange={(e) => set({ payPeriod: e.target.value as TimesheetSettings["payPeriod"] })}>
              <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice a month</option>
            </select></label>
          {settings.payPeriod === "biweekly" && <label className="block text-sm"><span className="font-medium">A period starts on</span><input type="date" name="ts-pay-anchor" data-testid="ts-pay-anchor" className={field} value={settings.payPeriodAnchor} onChange={(e) => set({ payPeriodAnchor: e.target.value })} /></label>}
          {num("remindMissedStartMinutes", "Remind about a missed start after (min, 0 = off)", "ts-remind-start")}
          {num("remindMissedEndMinutes", "Remind about a missed end after (min, 0 = off)", "ts-remind-end")}
        </div>
        {preview(p.period, "ts-preview-period")}
      </section>

      <section className={card} data-testid="ts-rules-pay" aria-labelledby="ts-h-pay">
        <h3 id="ts-h-pay" className="cr-section-label font-semibold">Pay rules (piece rate, commission, day/salary)</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {num("minWage", "Minimum wage ($/h, 0 = off)", "ts-min-wage", "Piece, commission and day pay are topped up to this for every hour worked.")}
          {tog("flsaNonHourly", flsaWords(settings).label, "ts-flsa-nonhourly")}
        </div>
        <p className="mt-3 text-sm font-medium">Job / task rates ($/h, override a worker&apos;s hourly rate on that task)</p>
        <ul className="mt-1 space-y-1" data-testid="ts-task-rates">{Object.entries(settings.taskRates).map(([k, v]) => (
          <li key={k} className="flex items-center gap-2" data-testid={`ts-task-${k}`}><span className="min-w-32">{k}</span><span className="tabular-nums">${v.toFixed(2)}/h</span>
            <button type="button" className="cr-btn-text text-xs" data-testid="ts-task-remove" onClick={() => { const next = { ...settings.taskRates }; delete next[k]; set({ taskRates: next }); }}>Remove</button></li>))}</ul>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <input name="ts-task-name" aria-label="Task name" placeholder="Task (e.g. Prevailing wage)" data-testid="ts-task-name" className={field} value={taskName} onChange={(e) => setTaskName(e.target.value)} />
          <input name="ts-task-rate" aria-label="Rate per hour" placeholder="$/h" inputMode="decimal" data-testid="ts-task-rate" className={`${field} w-24`} value={taskRate} onChange={(e) => setTaskRate(e.target.value)} />
          <button type="button" className="cr-btn cr-btn-secondary" data-testid="ts-task-add" onClick={() => { const r = Number(taskRate); if (taskName.trim() && r > 0) { set({ taskRates: { ...settings.taskRates, [taskName.trim().slice(0, 40)]: r } }); setTaskName(""); setTaskRate(""); } }}>Add rate</button>
        </div>
        <p className="cr-preview mt-2 text-sm text-[var(--cr-muted)]" data-testid="ts-preview-pay">{settings.minWage > 0 ? `Non-hourly pay is topped up to $${settings.minWage.toFixed(2)}/h.` : "No minimum-wage top-up."} {settings.flsaNonHourly ? flsaWords(settings).preview : ""}</p>
      </section>

      <section className={card} data-testid="ts-rules-pto" aria-labelledby="ts-h-pto">
        <h3 id="ts-h-pto" className="cr-section-label font-semibold">Paid time off / sick</h3>
        <PtoRulesFields settings={settings} set={set} />
        <p className="mt-1 text-xs"><Link href="/profile#time-off" className="underline" data-testid="ts-pto-settings-link">More time-off settings</Link></p>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="cr-btn cr-btn-primary" data-testid="ts-settings-save" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save rules"}</button>
        {dirty && <button type="button" className="cr-btn cr-btn-text" data-testid="ts-settings-reset" onClick={() => setSettings(saved)}>Discard changes</button>}
        <Link href="/help?a=timesheet-how-counted" className="underline" data-testid="ts-rules-help">How hours are counted</Link>
        {message && <span role="status" data-testid="ts-settings-message">{message}</span>}
      </div>
      <p className="mt-2 text-xs text-[var(--cr-muted)]">General information, not legal advice. Check your state&apos;s wage rules.</p>
      <TimeAuditLog />
    </details>
  );
}
