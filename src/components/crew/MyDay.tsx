"use client";
/**
 * Crew portal "My day" (replaces the old Clock in / Clock out; old clock entries stay readable for the owner).
 * Steps: Start day -> Start driving -> Arrived -> Working -> Break -> End day. Only the valid next taps are shown;
 * any other tap ("More") asks to confirm and is flagged for the boss, never dropped.
 * Every tap saves the time (the server stores its own time for live taps) plus GPS when allowed. GPS never blocks.
 * Only this worker's own taps are written. No prices or pay are shown here, only minutes.
 */
import { useEffect, useMemo, useState } from "react";
import { currentPosition, directionsUrl, loadMyFixes, loadMyTaps, loadMyTimeOverrides, loadMyTimeRules, localDate, recordTap, requestFix, syncPendingTaps } from "@/lib/day-events";
import {
  allowedTaps, buildDay, dayState, DEFAULT_TIMESHEET_SETTINGS, crewFlagReasons, geofencePrompt, geofenceRadius, hm, isAllowed, metersBetween, nextActions, stillDrivingDue,
  type DayStateName, type FixRequest, type WorkerTimeOverrides, type ScheduledJob, type TapEvent, type TapKind, type TimesheetSettings,
} from "@/lib/timesheet";

export type MyDayJob = { docId: string; label: string; address: string; date: string; startTime: string; endTime: string };
export const KIND_LABEL: Record<TapKind, string> = {
  start_day: "Started day", start_job: "Started job", start_transit: "Started driving", arrive: "Arrived at job",
  break_start: "Started break", break_end: "Ended break", end_day: "Ended day", end_shift: "Ended day",
};
export const ACTION_LABEL: Record<Exclude<TapKind, "end_shift">, string> = {
  start_day: "Start day", start_job: "Start job", start_transit: "Start driving", arrive: "Arrived at job",
  break_start: "Start break", break_end: "End break", end_day: "End day",
};
const STEPS = ["Travel", "Arrived", "Working", "Break", "Done"] as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const toIso = (date: string, hm5: string) => (date && /^\d{1,2}:\d{2}/.test(hm5) ? new Date(`${date}T${hm5.slice(0, 5)}:00`).toISOString() : "");
const pins = new Map<string, { lat: number; lng: number } | null>();
export const FIX_STATUS_LABEL: Record<FixRequest["status"], string> = { pending: "Pending", approved: "Approved", denied: "Declined" };

async function jobPin(address: string) {
  if (!address) return null;
  if (pins.has(address)) return pins.get(address) || null;
  try {
    const res = await fetch(`/api/drive-time?geocode=${encodeURIComponent(address)}`);
    const data = await res.json();
    const pin = typeof data.lat === "number" ? { lat: data.lat, lng: data.lng } : null;
    pins.set(address, pin);
    return pin;
  } catch { return null; }
}

/** Step tracker state for each step from the current day state. */
export function stepStates(state: DayStateName, events: TapEvent[]): Record<(typeof STEPS)[number], "done" | "current" | "locked"> {
  const had = (k: TapKind) => events.some((e) => e.kind === k);
  const ended = state === "OFF_DUTY" && events.length > 0;
  const cur: (typeof STEPS)[number] | null = ended ? "Done" : state === "IN_TRANSIT" ? "Travel" : state === "ON_BREAK" ? "Break" : state === "WORKING" ? "Working" : state === "ON_DUTY_IDLE" ? "Arrived" : null;
  const done = { Travel: had("start_transit"), Arrived: had("arrive") || had("start_job"), Working: had("start_job") || had("arrive"), Break: had("break_end"), Done: ended };
  return Object.fromEntries(STEPS.map((s) => [s, s === cur ? "current" : done[s] || ended ? "done" : "locked"])) as Record<(typeof STEPS)[number], "done" | "current" | "locked">;
}

export default function MyDay({ email, employeeId, jobs }: { email: string; employeeId: string; jobs: MyDayJob[] }) {
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [rules, setRules] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => new Date().toISOString());
  const [locDenied, setLocDenied] = useState(false);
  const [confirmTap, setConfirmTap] = useState<{ kind: TapKind; job?: MyDayJob } | null>(null);
  const [geoSheet, setGeoSheet] = useState<"arrive" | "leave" | null>(null);
  const [geoDismissed, setGeoDismissed] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [worker, setWorker] = useState<WorkerTimeOverrides>({});
  const [fixOpen, setFixOpen] = useState<{ eventId?: string; kind: TapKind; at: string; reason: string; docId?: string; date: string } | null>(null);
  const today = localDate(new Date(now));
  const yesterday = localDate(new Date(new Date(now).getTime() - 86400000));

  useEffect(() => {
    if (!email) return;
    const load = () => { void loadMyTaps(email).then(setEvents); void loadMyFixes(email).then(setFixes); };
    load(); void loadMyTimeRules().then(setRules); void loadMyTimeOverrides().then(setWorker);
    const online = () => void syncPendingTaps(email).then(load);
    window.addEventListener("online", online);
    void syncPendingTaps(email).then((r) => r.sent && load());
    return () => window.removeEventListener("online", online);
  }, [email]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date().toISOString()), 15000); return () => window.clearInterval(t); }, []);

  const todays = useMemo(() => events.filter((e) => e.date === today).sort((a, b) => a.at.localeCompare(b.at)), [events, today]);
  const yesterdays = useMemo(() => events.filter((e) => e.date === yesterday), [events, yesterday]);
  const plan = useMemo(() => jobs.filter((j) => j.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)), [jobs, today]);
  const ds = dayState(todays);
  const state = ds.state;
  const doneDocs = new Set(todays.filter((e) => e.kind === "start_job" || e.kind === "arrive").map((e) => e.docId));
  const current = plan.find((j) => j.docId === ds.docId);
  const next = plan.find((j) => !doneDocs.has(j.docId) && j.docId !== ds.docId);
  const schedule: ScheduledJob[] = plan.map((j) => ({ docId: j.docId, start: toIso(j.date, j.startTime), end: toIso(j.date, j.endTime), label: j.label })).filter((j) => j.start && j.end);
  const sheet = buildDay({ employeeId: employeeId || "me", date: today, events: todays.map((e) => ({ ...e, employeeId: employeeId || "me" })), schedule, now, settings: rules, worker });
  const askStillDriving = stillDrivingDue(todays, now, rules);
  const forgotYesterday = yesterdays.length > 0 && dayState(yesterdays).state !== "OFF_DUTY" && !fixes.some((f) => f.date === yesterday && (f.kind === "end_day" || f.kind === "end_shift"));
  const breakMs = state === "ON_BREAK" && ds.since ? new Date(now).getTime() - new Date(ds.since).getTime() : 0;
  const workedMin = sheet.workMinutes + sheet.driveMinutes;
  const hadBreak = todays.some((e) => e.kind === "break_start");
  const breakDueAfter = rules.breakPreset === "california" ? 4.5 * 60 : rules.autoMealOn ? rules.autoMealAfterHours * 60 - 30 : 0;
  const breakDue = breakDueAfter > 0 && state === "WORKING" && !hadBreak && workedMin >= breakDueAfter;
  const firstPlanned = schedule[0]; const lastPlanned = schedule[schedule.length - 1];
  const missedStart = state === "OFF_DUTY" && !todays.length && firstPlanned && new Date(now).getTime() > new Date(firstPlanned.start).getTime() + rules.remindMissedStartMinutes * 60000;
  const missedEnd = state !== "OFF_DUTY" && lastPlanned && new Date(now).getTime() > new Date(lastPlanned.end).getTime() + rules.remindMissedEndMinutes * 60000;
  const reminder = missedStart ? "Your first job was planned to start already. Tap Start day when you begin." : missedEnd ? `Your last job was planned to end over ${hm(rules.remindMissedEndMinutes)} ago. Still working? If not, tap End day.` : breakDue ? (rules.breakPreset === "california" ? "Meal break due before your 5th hour. Tap Start break." : "Break due soon. Tap Start break.") : "";
  const allowed = allowedTaps(state);
  const pendingCount = todays.filter((e) => e.pending).length;

  // Primary next step: one big button (the engine's first valid action; End day is never primary).
  const actions = nextActions(state, { hasNextJob: Boolean(next), tapsToday: todays.length });
  const pa = actions.find((x) => x.primary);
  const target = next || plan[0];
  const arriveAt = current || next;
  const primary: { kind: Exclude<TapKind, "end_shift">; job?: MyDayJob; label: string } | null = !pa ? null
    : pa.kind === "start_transit" ? { kind: pa.kind, job: target, label: target ? `Start driving to ${target.label}` : "Start driving" }
    : pa.kind === "arrive" ? { kind: pa.kind, job: arriveAt, label: `Arrived${arriveAt ? ` · ${arriveAt.label}` : ""}` }
    : pa.kind === "start_job" ? { kind: pa.kind, job: target, label: target ? `Start job · ${target.label}` : "Start job" }
    : { kind: pa.kind, label: ACTION_LABEL[pa.kind] };

  // Foreground reminders and the geofence prompt (only while the app is open; never blocks).
  useEffect(() => {
    const msg = askStillDriving ? "Still driving? Tap Arrived when you get there, or End day." : reminder;
    if (!msg || typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState !== "visible") return;
    try { new Notification("My day", { body: msg }); } catch { /* not supported */ }
  }, [askStillDriving, reminder]);
  useEffect(() => {
    const target = state === "IN_TRANSIT" ? current || next : state === "WORKING" ? current : undefined;
    if (!target || document.visibilityState !== "visible") return;
    let off = false;
    void (async () => {
      const pos = await currentPosition();
      if (off) return;
      if (!pos) { setLocDenied(true); return; }
      setLocDenied(false);
      const pin = await jobPin(target.address);
      const radius = geofenceRadius(rules, target.docId, worker);
      if (radius <= 0) return; // geofence off for this worker/job: no prompts
      const p = geofencePrompt(state, pos, pin, radius);
      if (!off && p && geoDismissed !== `${p}:${target.docId}:${state}`) setGeoSheet(p);
    })();
    return () => { off = true; };
  }, [now, state, current, next, rules, worker, geoDismissed]);

  async function tap(kind: TapKind, job?: MyDayJob, confirmed = false) {
    if (busy) return;
    if (!confirmed && !isAllowed(state, kind)) { setConfirmTap({ kind, job }); return; }
    setBusy(true); setNote(""); setConfirmTap(null); setGeoSheet(null);
    const at = new Date().toISOString();
    const pos = await currentPosition();
    setLocDenied(!pos);
    let notAtSite = false;
    if (kind === "start_job" || kind === "arrive") {
      if (!pos) notAtSite = geofenceRadius(rules, job?.docId, worker) > 0;
      else { const pin = job ? await jobPin(job.address) : null; const radius = geofenceRadius(rules, job?.docId, worker); if (pin && radius > 0 && metersBetween(pos, pin) > radius) notAtSite = true; }
    }
    if (kind === "start_transit" && job?.address) window.open(directionsUrl(job.address), "_blank", "noopener");
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
    const { event, saved, local } = await recordTap({ employeeId: employeeId || "me", date: today, kind, at, deviceAt: at, docId: job?.docId || (kind === "start_job" ? (next || plan[0])?.docId : undefined), ...(pos || {}), notAtSite, ...(confirmed ? { outOfOrder: true } : {}) }, email);
    setEvents((list) => [...list.filter((e) => e.id !== event.id), event]);
    setNote(saved !== "ok" ? `Saved on this phone, will send when online: ${saved}` : `${KIND_LABEL[kind]} at ${time(at)}.${notAtSite ? " Marked “not at job site” for your boss to check. That's okay." : ""}${confirmed ? " Flagged for your boss to check." : ""}${local ? " Saved on this phone, will send when online." : ""}`);
    setBusy(false);
  }

  async function sendFix() {
    if (!fixOpen || !fixOpen.reason.trim() || !fixOpen.at) return;
    const at = toIso(fixOpen.date, fixOpen.at) || fixOpen.at;
    const { fix, error } = await requestFix({ employeeId: employeeId || "me", date: fixOpen.date, eventId: fixOpen.eventId, kind: fixOpen.kind, at, reason: fixOpen.reason.trim(), docId: fixOpen.docId }, email);
    setFixes((list) => [...list, fix]);
    setFixOpen(null);
    setNote(error ? `Could not send: ${error}` : "Time fix sent to your boss.");
  }

  const steps = stepStates(state, todays);
  const reasons = crewFlagReasons(sheet, [], rules);
  const paidBreak = sheet.breaks.filter((b) => b.paid).reduce((s, b) => s + b.minutes, 0);
  const stateText = state === "WORKING" ? `Working${current ? ` · ${current.label}` : ""}` : state === "IN_TRANSIT" ? "Driving" : state === "ON_BREAK" ? "On break" : state === "ON_DUTY_IDLE" ? "On duty" : todays.length ? "Day ended" : "Off duty";
  const more = (Object.keys(ACTION_LABEL) as Exclude<TapKind, "end_shift">[]).filter((k) => k !== primary?.kind && k !== "end_day" && k !== "break_start" && k !== "break_end");

  return (
    <section data-testid="my-day" data-state={state} className="cr-section space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">My day</h3>
        <span data-testid="my-day-state" data-state={state} className="cr-chip2 cr-tone-teal">{stateText}</span>
      </div>
      {forgotYesterday && (
        <div data-testid="forgot-end" data-state="warn" className="cr-panel cr-tone-warn space-y-2 text-sm">
          <p className="font-semibold">Forgot to end your day yesterday?</p>
          <button data-testid="forgot-end-fix" className="cr-btn cr-btn-secondary" onClick={() => setFixOpen({ kind: "end_day", at: "", reason: "Forgot to tap End day", date: yesterday, docId: yesterdays[yesterdays.length - 1]?.docId })}>Tell your boss when you finished</button>
        </div>
      )}
      <ol data-testid="step-tracker" className="flex justify-between gap-1 text-xs">
        {STEPS.map((s) => <li key={s} data-testid={`step-${s.toLowerCase()}`} data-step-state={steps[s]} className="cr-slot-chip flex-1 text-center">{s}</li>)}
      </ol>
      {reminder && <p data-testid="my-day-reminder" role="status" className="cr-panel cr-tone-warn text-sm font-semibold">{reminder}</p>}
      {askStillDriving && <p data-testid="still-driving" className="cr-panel cr-tone-warn text-sm font-semibold">Still driving? Tap “Arrived” when you get there, or “End day”. If not, your day ends at your last stop.</p>}
      {locDenied && <p data-testid="location-denied" data-state="denied" className="cr-panel cr-tone-warn text-sm">Location is off. Your taps still save; they are marked for your boss to check. Turn on location for this site to skip that.</p>}
      {primary && (
        <button data-testid="tap-primary" data-kind={primary.kind} disabled={busy} className="cr-btn cr-btn-primary min-h-14! w-full text-lg font-bold" onClick={() => tap(primary.kind, primary.job)}>{primary.label}</button>
      )}
      {(allowed.includes("break_start") || state === "ON_BREAK") && (
        <button data-testid="tap-break" data-state={state === "ON_BREAK" ? "on" : "off"} disabled={busy} className="cr-btn cr-btn-secondary w-full" onClick={() => tap(state === "ON_BREAK" ? "break_end" : "break_start")}>
          {state === "ON_BREAK" ? <span data-testid="break-timer-wrap"><span data-testid="tap-break-label">On break</span> <span data-testid="break-timer" className="tabular-nums">{Math.floor(breakMs / 60000)}:{String(Math.floor((breakMs % 60000) / 1000)).padStart(2, "0")}</span>{breakMs / 60000 < rules.shortBreakPaidMinutes ? ` · paid under ${rules.shortBreakPaidMinutes} min` : " · unpaid"}</span> : <span data-testid="tap-break-label">Start break</span>}
        </button>
      )}
      {note && <p data-testid="my-day-note" role="status" className="text-sm">{note}</p>}
      <div data-testid="my-day-totals" className="cr-stat-row grid grid-cols-2 gap-2 text-sm tabular-nums">
        <p data-testid="my-day-hours">Today: <b className="tabular-nums">{hm(sheet.paidMinutes)}</b> paid · day total <b data-testid="my-day-total" className="tabular-nums">{hm(sheet.paidMinutes + sheet.breakMinutes + sheet.unpaidGapMinutes)}</b></p>
        <p data-testid="my-day-breaks">Breaks: <b>{hm(sheet.breakMinutes + paidBreak)}</b> ({hm(paidBreak)} paid, {hm(sheet.breakMinutes)} unpaid)</p>
        {sheet.driveMinutes > 0 && <p data-testid="my-day-drive">Driving: {hm(sheet.driveMinutes)}</p>}
        {sheet.unpaidGapMinutes > 0 && <p data-testid="my-day-unpaid">Unpaid gaps: {hm(sheet.unpaidGapMinutes)}</p>}
        {sheet.roundingMinutes !== 0 && <p data-testid="my-day-rounding">Rounding: {sheet.roundingMinutes > 0 ? "+" : ""}{sheet.roundingMinutes} min</p>}
      </div>
      {reasons.length > 0 && <ul data-testid="my-day-flags" className="space-y-1 text-xs">{reasons.map((r) => <li key={r.flag} data-flag={r.flag} className="cr-text-warn">{r.text}</li>)}</ul>}
      <ol data-testid="my-day-list" className="space-y-1 text-sm">
        {plan.map((j) => <li key={`p-${j.docId}`} className="flex justify-between gap-2 text-[var(--cr-muted)]"><span>Planned · {j.label}</span><span>{j.startTime.slice(0, 5)}–{j.endTime.slice(0, 5)}</span></li>)}
        {todays.map((e) => (
          <li key={e.id} data-testid="my-day-tap" data-pending={e.pending ? "true" : "false"} className="flex items-center justify-between gap-2">
            <span>{time(e.at)} · {KIND_LABEL[e.kind]}{e.docId ? ` · ${plan.find((j) => j.docId === e.docId)?.label || ""}` : ""}{e.notAtSite ? " · not at job site" : ""}{e.outOfOrder ? " · flagged" : ""}
              {e.pending && <span data-testid="pending-sync" className="cr-chip2 cr-tone-warn ml-1">Not sent yet</span>}</span>
            <button className="cr-btn-text shrink-0 text-xs" data-testid="fix-time" onClick={() => setFixOpen({ eventId: e.id, kind: e.kind, at: new Date(e.at).toTimeString().slice(0, 5), reason: "", docId: e.docId, date: today })}>Fix time</button>
          </li>
        ))}
      </ol>
      {pendingCount > 0 && <p data-testid="pending-count" className="text-xs cr-text-warn">{pendingCount} tap{pendingCount > 1 ? "s" : ""} saved on this phone, sending when online.</p>}
      <details data-testid="my-day-more" className="cr-collapse text-sm">
        <summary>More taps</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {more.map((k) => <button key={k} data-testid={`tap-${k.replace("_", "-")}`} disabled={busy} className="cr-btn cr-btn-secondary" onClick={() => tap(k, k === "start_transit" ? next : current || next)}>{ACTION_LABEL[k]}</button>)}
        </div>
        <button className="cr-btn-text mt-2" data-testid="fix-missing" onClick={() => setFixOpen({ kind: "start_day", at: "", reason: "", docId: plan[0]?.docId, date: today })}>Forgot to tap? Ask for a time fix</button>
      </details>
      {state !== "OFF_DUTY" && (
        <div className="border-t pt-3"><button data-testid="tap-end-day" data-state="destructive" disabled={busy} className="cr-btn cr-btn-secondary cr-tone-bad w-full" onClick={() => setConfirmEnd(true)}>End day</button></div>
      )}
      {confirmEnd && (
        <div data-testid="confirm-end" role="dialog" className="cr-panel cr-tone-warn space-y-2 text-sm">
          <p>End your day now? After this, new taps today are flagged for your boss.</p>
          <div className="flex gap-2"><button data-testid="confirm-end-yes" className="cr-btn cr-btn-primary min-h-11 flex-1" onClick={() => { setConfirmEnd(false); void tap("end_day"); }}>Yes, end my day</button><button data-testid="confirm-end-no" className="cr-btn cr-btn-secondary min-h-11" onClick={() => setConfirmEnd(false)}>Keep working</button></div>
        </div>
      )}
      {confirmTap && (
        <div data-testid="confirm-tap" role="dialog" className="cr-panel cr-tone-warn space-y-2 text-sm">
          <p>“{ACTION_LABEL[confirmTap.kind === "end_shift" ? "end_day" : confirmTap.kind]}” is not the usual next step right now ({stateText}). Save it anyway? Your boss will see it flagged.</p>
          <div className="flex gap-2"><button data-testid="confirm-tap-yes" className="cr-btn cr-btn-primary flex-1" onClick={() => tap(confirmTap.kind, confirmTap.job, true)}>Save anyway</button><button data-testid="confirm-tap-no" className="cr-btn cr-btn-secondary" onClick={() => setConfirmTap(null)}>Cancel</button></div>
        </div>
      )}
      {geoSheet && (
        <div data-testid="geo-sheet" data-kind={geoSheet} role="dialog" className="cr-actionbar fixed inset-x-0 bottom-0 z-40 space-y-2 p-4">
          <p className="font-semibold">{geoSheet === "arrive" ? "Arrived at the job?" : "Left the job site?"}</p>
          <div className="flex gap-2">
            <button data-testid="geo-sheet-yes" className="cr-btn cr-btn-primary min-h-14! flex-1" onClick={() => geoSheet === "arrive" ? tap("arrive", current || next) : tap(next ? "start_transit" : "end_day", next)}>{geoSheet === "arrive" ? "Yes, I'm here" : next ? `Driving to ${next.label}` : "End day"}</button>
            <button data-testid="geo-sheet-no" className="cr-btn cr-btn-secondary min-h-14! flex-1" onClick={() => { setGeoDismissed(`${geoSheet}:${(current || next)?.docId}:${state}`); setGeoSheet(null); }}>Not yet</button>
          </div>
        </div>
      )}
      {fixOpen && (
        <div data-testid="fix-form" className="cr-panel space-y-2">
          <p className="text-sm">Day: {fixOpen.date}</p>
          <label className="block text-sm"><span className="cr-section-label">What</span>
            <select data-testid="fix-kind" className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.kind} onChange={(e) => setFixOpen({ ...fixOpen, kind: e.target.value as TapKind })}>
              {(Object.keys(ACTION_LABEL) as Exclude<TapKind, "end_shift">[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select></label>
          <label className="block text-sm"><span className="cr-section-label">Correct time</span><input data-testid="fix-at" type="time" className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.at} onChange={(e) => setFixOpen({ ...fixOpen, at: e.target.value })} /></label>
          <label className="block text-sm"><span className="cr-section-label">Reason</span><input data-testid="fix-reason" maxLength={300} className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.reason} onChange={(e) => setFixOpen({ ...fixOpen, reason: e.target.value })} /></label>
          <div className="flex gap-2"><button data-testid="fix-send" disabled={!fixOpen.reason.trim() || !fixOpen.at} className="cr-btn cr-btn-primary flex-1" onClick={sendFix}>Send to boss</button><button data-testid="fix-cancel" className="cr-btn cr-btn-secondary" onClick={() => setFixOpen(null)}>Cancel</button></div>
        </div>
      )}
      {fixes.length > 0 && (
        <ul data-testid="fix-history" className="space-y-1 text-xs"><li className="cr-section-label">My time fixes</li>
          {[...fixes].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 10).map((f) => (
            <li key={f.id} data-testid="fix-status" data-fix-id={f.id} data-state={f.status}>{f.date} · {KIND_LABEL[f.kind]} → {time(f.at)} · <span className={`cr-chip2 ${f.status === "approved" ? "cr-tone-good" : f.status === "denied" ? "cr-tone-bad" : "cr-tone-warn"}`}>{FIX_STATUS_LABEL[f.status]}</span>{f.ownerNote ? <span data-testid="fix-owner-note"> · Boss: “{f.ownerNote}”</span> : null}</li>
          ))}
        </ul>
      )}
      <a href="/crew?tab=hours" data-testid="my-day-week-link" className="cr-btn cr-btn-text text-sm">My hours ›</a>
    </section>
  );
}
