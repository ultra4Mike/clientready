"use client";
/**
 * Crew portal "My day": Start job -> Start driving (opens Maps to the next job) -> Arrive at job -> ... -> End shift / break.
 * Every tap saves a time plus GPS when allowed. GPS never blocks: off, denied or more than ~200 m from the job
 * just marks the tap "not at job site" for the owner. Only this worker's own taps are written (clock rule).
 * No prices or pay are shown here.
 */
import { useEffect, useMemo, useState } from "react";
import { currentPosition, directionsUrl, loadMyFixes, loadMyTaps, localDate, recordTap, requestFix } from "@/lib/day-events";
import { buildDay, dayState, metersBetween, SITE_RADIUS_METERS, stillDrivingDue, type FixRequest, type ScheduledJob, type TapEvent, type TapKind } from "@/lib/timesheet";

export type MyDayJob = { docId: string; label: string; address: string; date: string; startTime: string; endTime: string };
const KIND_LABEL: Record<TapKind, string> = { start_job: "Started job", start_transit: "Started driving", arrive: "Arrived at job", end_shift: "Ended shift / break" };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const toIso = (date: string, hm: string) => (date && /^\d{1,2}:\d{2}/.test(hm) ? new Date(`${date}T${hm.slice(0, 5)}:00`).toISOString() : "");
const pins = new Map<string, { lat: number; lng: number } | null>();

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

export default function MyDay({ email, employeeId, jobs }: { email: string; employeeId: string; jobs: MyDayJob[] }) {
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => new Date().toISOString());
  const [fixOpen, setFixOpen] = useState<{ eventId?: string; kind: TapKind; at: string; reason: string; docId?: string } | null>(null);
  const today = localDate(new Date());
  useEffect(() => { if (!email) return; void loadMyTaps(email).then(setEvents); void loadMyFixes(email).then(setFixes); }, [email]);
  useEffect(() => { const t = window.setInterval(() => setNow(new Date().toISOString()), 30000); return () => window.clearInterval(t); }, []);
  const todays = useMemo(() => events.filter((e) => e.date === today).sort((a, b) => a.at.localeCompare(b.at)), [events, today]);
  const plan = useMemo(() => jobs.filter((j) => j.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime)), [jobs, today]);
  const state = dayState(todays);
  const doneDocs = new Set(todays.filter((e) => e.kind === "start_job" || e.kind === "arrive").map((e) => e.docId));
  const current = plan.find((j) => j.docId === state.docId);
  const next = plan.find((j) => !doneDocs.has(j.docId) && j.docId !== state.docId);
  const schedule: ScheduledJob[] = plan.map((j) => ({ docId: j.docId, start: toIso(j.date, j.startTime), end: toIso(j.date, j.endTime), label: j.label })).filter((j) => j.start && j.end);
  const sheet = buildDay({ employeeId: employeeId || "me", date: today, events: todays.map((e) => ({ ...e, employeeId: employeeId || "me" })), schedule, now });
  const askStillDriving = stillDrivingDue(todays, now);

  useEffect(() => {
    if (!askStillDriving || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try { new Notification("Still driving?", { body: "Tap Arrive at job when you get there, or End shift." }); } catch { /* not supported */ }
  }, [askStillDriving]);

  async function tap(kind: TapKind, job?: MyDayJob) {
    if (busy) return;
    setBusy(true); setNote("");
    const at = new Date().toISOString();
    const pos = await currentPosition();
    let notAtSite = false;
    if (kind === "start_job" || kind === "arrive") {
      if (!pos) notAtSite = true;
      else { const pin = job ? await jobPin(job.address) : null; if (pin && metersBetween(pos, pin) > SITE_RADIUS_METERS) notAtSite = true; }
    }
    if (kind === "start_transit" && job?.address) window.open(directionsUrl(job.address), "_blank", "noopener");
    if (kind === "start_transit" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
    const { event, saved, local } = await recordTap({ employeeId: employeeId || "me", date: today, kind, at, docId: job?.docId, ...(pos || {}), notAtSite }, email);
    setEvents((list) => [...list.filter((e) => e.id !== event.id), event]);
    setNote(saved !== "ok" ? `Saved on this phone: ${saved}` : `${KIND_LABEL[kind]} at ${time(at)}.${notAtSite ? " Marked “not at job site” for your boss to check (GPS off or far from the job). That's okay." : ""}${local ? " Saved on this phone." : ""}`);
    setBusy(false);
  }

  async function sendFix() {
    if (!fixOpen || !fixOpen.reason.trim() || !fixOpen.at) return;
    const at = toIso(today, fixOpen.at) || fixOpen.at;
    const { fix, error } = await requestFix({ employeeId: employeeId || "me", date: today, eventId: fixOpen.eventId, kind: fixOpen.kind, at, reason: fixOpen.reason.trim(), docId: fixOpen.docId }, email);
    setFixes((list) => [...list, fix]);
    setFixOpen(null);
    setNote(error ? `Could not send: ${error}` : "Time fix sent to your boss.");
  }

  const big = "min-h-14 w-full rounded-xl px-4 text-lg font-bold shadow-sm active:scale-[.99] disabled:opacity-50";
  return (
    <section data-testid="my-day" className="space-y-3 rounded-2xl border border-teal-500/30 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">My day</h3>
        <span data-testid="my-day-state" className="rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold">
          {state.state === "WORKING" ? `Working${current ? ` · ${current.label}` : ""}` : state.state === "IN_TRANSIT" ? "Driving" : "Off duty"}
        </span>
      </div>
      {askStillDriving && <p data-testid="still-driving" className="rounded-lg bg-amber-500/15 p-3 text-sm font-semibold">Still driving? Tap “Arrive at job” when you get there, or “End shift”. If not, your day ends at your last stop.</p>}
      <div className="grid gap-2">
        {state.state === "OFF_DUTY" && (next || plan[0]) && <button data-testid="tap-start-job" disabled={busy} className={`${big} bg-teal-600 text-white`} onClick={() => tap("start_job", next || plan[0])}>Start job · {(next || plan[0]).label}</button>}
        {state.state === "OFF_DUTY" && !plan.length && <button data-testid="tap-start-job" disabled={busy} className={`${big} bg-teal-600 text-white`} onClick={() => tap("start_job")}>Start job</button>}
        {state.state === "WORKING" && next && <button data-testid="tap-start-transit" disabled={busy} className={`${big} bg-sky-600 text-white`} onClick={() => tap("start_transit", next)}>Start driving to {next.label}</button>}
        {state.state === "IN_TRANSIT" && <button data-testid="tap-arrive" disabled={busy} className={`${big} bg-teal-600 text-white`} onClick={() => tap("arrive", plan.find((j) => j.docId === state.docId) || next)}>Arrive at job{(plan.find((j) => j.docId === state.docId) || next) ? ` · ${(plan.find((j) => j.docId === state.docId) || next)!.label}` : ""}</button>}
        {state.state !== "OFF_DUTY" && <button data-testid="tap-end-shift" disabled={busy} className={`${big} border border-slate-400/50`} onClick={() => tap("end_shift")}>End shift / break</button>}
      </div>
      {note && <p data-testid="my-day-note" role="status" className="text-sm">{note}</p>}
      <ol data-testid="my-day-list" className="space-y-1 text-sm">
        {plan.map((j) => <li key={`p-${j.docId}`} className="flex justify-between gap-2 text-[var(--cr-muted)]"><span>Planned · {j.label}</span><span>{j.startTime.slice(0, 5)}–{j.endTime.slice(0, 5)}</span></li>)}
        {todays.map((e) => (
          <li key={e.id} data-testid="my-day-tap" className="flex items-center justify-between gap-2">
            <span>{time(e.at)} · {KIND_LABEL[e.kind]}{e.docId ? ` · ${plan.find((j) => j.docId === e.docId)?.label || ""}` : ""}{e.notAtSite ? " · not at job site" : ""}</span>
            <button className="shrink-0 text-xs underline" data-testid="fix-time" onClick={() => setFixOpen({ eventId: e.id, kind: e.kind, at: new Date(e.at).toTimeString().slice(0, 5), reason: "", docId: e.docId })}>Fix time</button>
          </li>
        ))}
      </ol>
      <p data-testid="my-day-hours" className="text-sm">Today so far: <b>{sheet.paidHours.toFixed(2)} h</b>{sheet.driveMinutes ? ` (incl. ${Math.round(sheet.driveMinutes)} min driving)` : ""}{sheet.flags.includes("from_schedule") ? " · some times from your schedule" : ""}</p>
      <button className="text-sm underline" data-testid="fix-missing" onClick={() => setFixOpen({ kind: "start_job", at: "", reason: "", docId: plan[0]?.docId })}>Forgot to tap? Ask for a time fix</button>
      {fixOpen && (
        <div data-testid="fix-form" className="space-y-2 rounded-xl border border-slate-400/40 p-3">
          <label className="block text-sm">What
            <select className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.kind} onChange={(e) => setFixOpen({ ...fixOpen, kind: e.target.value as TapKind })}>
              {(Object.keys(KIND_LABEL) as TapKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select></label>
          <label className="block text-sm">Correct time<input data-testid="fix-at" type="time" className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.at} onChange={(e) => setFixOpen({ ...fixOpen, at: e.target.value })} /></label>
          <label className="block text-sm">Reason<input data-testid="fix-reason" maxLength={300} className="mt-1 block min-h-11 w-full rounded-lg border bg-transparent px-2" value={fixOpen.reason} onChange={(e) => setFixOpen({ ...fixOpen, reason: e.target.value })} /></label>
          <div className="flex gap-2"><button data-testid="fix-send" disabled={!fixOpen.reason.trim() || !fixOpen.at} className="min-h-11 flex-1 rounded-lg bg-teal-600 font-semibold text-white disabled:opacity-50" onClick={sendFix}>Send to boss</button><button className="min-h-11 rounded-lg border px-3" onClick={() => setFixOpen(null)}>Cancel</button></div>
        </div>
      )}
      {fixes.filter((f) => f.date >= localDate(new Date(Date.now() - 7 * 86400000))).length > 0 && (
        <ul data-testid="fix-history" className="space-y-1 text-xs text-[var(--cr-muted)]">
          {fixes.slice(-5).map((f) => <li key={f.id}>{f.date} · {KIND_LABEL[f.kind]} → {time(f.at)} · {f.status === "pending" ? "waiting" : f.status}</li>)}
        </ul>
      )}
    </section>
  );
}
