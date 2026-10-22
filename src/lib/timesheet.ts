/**
 * Day timesheet engine (pure: no storage, no network).
 * A worker's day is built from tap events (Start job / Start driving / Arrive / End shift) and filled
 * from the schedule where taps are missing. Pay uses the DAY total; per-job minutes are for job costing.
 *  - Paid day = first job start -> last job end.
 *  - A gap between two jobs longer than gapMinutes (default 60) is unpaid, unless he logged driving
 *    that covers it (then only the driving part is paid, capped at the gap).
 *  - Shorter gaps and logged transit count as paid drive time. Home -> first job and last job -> home are not paid.
 *  - A missing job start/end comes from the schedule and is flagged "from schedule".
 *  - Transit with no arrival after transitTimeoutMinutes, or no End shift, ends the day at the last real stop ("auto-ended").
 */
export type TapKind = "start_job" | "start_transit" | "arrive" | "end_shift";
export type TapEvent = {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD (worker's local day)
  kind: TapKind;
  at: string; // ISO
  docId?: string; // the job (start_job / arrive) or the destination (start_transit)
  lat?: number;
  lng?: number;
  /** Set by the portal when GPS was off or the tap was more than ~200 m from the job. */
  notAtSite?: boolean;
};
export type ScheduledJob = { docId: string; start: string; end: string; label?: string; lat?: number; lng?: number }; // ISO start/end
export type DayFlag = "from_schedule" | "not_at_site" | "long_drive" | "auto_ended" | "fix_requested" | "edited" | "changed_since_approved";
export type TimesheetSettings = { gapMinutes: number; transitTimeoutMinutes: number; halfDayHours: number };
export const DEFAULT_TIMESHEET_SETTINGS: TimesheetSettings = { gapMinutes: 60, transitTimeoutMinutes: 120, halfDayHours: 4 };

export type JobSpan = { docId: string; start: string; end: string; minutes: number; fromSchedule: boolean; notAtSite: boolean; label?: string };
export type DriveLeg = { fromDocId?: string; toDocId?: string; start: string; end: string; minutes: number; paidMinutes: number; expectedMinutes?: number; longDrive?: boolean };
export type DaySheet = {
  employeeId: string;
  date: string;
  jobs: JobSpan[];
  drives: DriveLeg[];
  workMinutes: number;
  driveMinutes: number;
  unpaidGapMinutes: number;
  paidMinutes: number;
  paidHours: number;
  flags: DayFlag[];
  /** Day ended at the last real stop because driving or the shift was never closed. */
  autoEnded: boolean;
};

const ms = (iso: string) => Date.parse(iso);
const mins = (a: string, b: string) => Math.max(0, (ms(b) - ms(a)) / 60000);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function readTimesheetSettings(raw: unknown): TimesheetSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof TimesheetSettings, unknown>>;
  const pick = (value: unknown, fallback: number) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; };
  return {
    gapMinutes: pick(v.gapMinutes, DEFAULT_TIMESHEET_SETTINGS.gapMinutes),
    transitTimeoutMinutes: pick(v.transitTimeoutMinutes, DEFAULT_TIMESHEET_SETTINGS.transitTimeoutMinutes),
    halfDayHours: pick(v.halfDayHours, DEFAULT_TIMESHEET_SETTINGS.halfDayHours),
  };
}

/** Current state of the worker from his taps (what the portal shows). */
export function dayState(events: TapEvent[]): { state: "OFF_DUTY" | "WORKING" | "IN_TRANSIT"; docId?: string; since?: string } {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  const last = sorted[sorted.length - 1];
  if (!last || last.kind === "end_shift") return { state: "OFF_DUTY", since: last?.at };
  if (last.kind === "start_transit") return { state: "IN_TRANSIT", docId: last.docId, since: last.at };
  return { state: "WORKING", docId: last.docId, since: last.at };
}

/**
 * Build one worker's day. `now` is used only to decide whether open transit / an open shift timed out;
 * a day in the past with no End shift is always closed at the last real stop.
 */
const OPEN_JOB_MAX_MS = 12 * 3600000;

export function buildDay(input: {
  employeeId: string;
  date: string;
  events: TapEvent[];
  schedule: ScheduledJob[];
  settings?: Partial<TimesheetSettings>;
  now?: string;
  expectedDriveMinutes?: (fromDocId: string | undefined, toDocId: string | undefined) => number | undefined;
}): DaySheet {
  const settings = { ...DEFAULT_TIMESHEET_SETTINGS, ...(input.settings || {}) };
  const events = input.events.filter((e) => e.employeeId === input.employeeId && e.date === input.date).sort((a, b) => ms(a.at) - ms(b.at));
  const flags = new Set<DayFlag>();
  const jobs: JobSpan[] = [];
  const drives: DriveLeg[] = [];
  let openJob: { docId: string; start: string; notAtSite: boolean } | null = null;
  let openDrive: { from?: string; to?: string; start: string } | null = null;
  let lastJobDoc: string | undefined;
  const sched = new Map(input.schedule.map((job) => [job.docId, job]));
  const closeJob = (at: string, fromSchedule = false) => {
    if (!openJob) return;
    jobs.push({ docId: openJob.docId, start: openJob.start, end: at, minutes: mins(openJob.start, at), fromSchedule, notAtSite: openJob.notAtSite, label: sched.get(openJob.docId)?.label });
    lastJobDoc = openJob.docId;
    openJob = null;
  };
  for (const event of events) {
    if (event.notAtSite) flags.add("not_at_site");
    if (event.kind === "start_job" || event.kind === "arrive") {
      if (openDrive) { drives.push({ fromDocId: openDrive.from, toDocId: event.docId || openDrive.to, start: openDrive.start, end: event.at, minutes: mins(openDrive.start, event.at), paidMinutes: 0 }); openDrive = null; }
      if (openJob && openJob.docId !== event.docId) closeJob(event.at);
      if (!openJob && event.docId) openJob = { docId: event.docId, start: event.at, notAtSite: Boolean(event.notAtSite) };
    } else if (event.kind === "start_transit") {
      closeJob(event.at);
      if (!openDrive) openDrive = { from: lastJobDoc, to: event.docId, start: event.at };
    } else if (event.kind === "end_shift") {
      closeJob(event.at);
      if (openDrive) { openDrive = null; } // driving home is not paid (End shift / break = OFF_DUTY; a later Start job resumes)
    }
  }
  const nowMs = input.now ? ms(input.now) : Number.POSITIVE_INFINITY;
  // Open drive with no arrival: wait until the timeout, then end the day at the last real stop.
  if (openDrive) {
    const drive = openDrive as { from?: string; to?: string; start: string };
    if (nowMs - ms(drive.start) > settings.transitTimeoutMinutes * 60000) { flags.add("auto_ended"); openDrive = null; }
  }
  // Open job with no End shift: close at the scheduled end (or the job start if none), once that time has passed.
  if (openJob) {
    const job = openJob as { docId: string; start: string; notAtSite: boolean };
    const plannedEnd = sched.get(job.docId)?.end;
    if (plannedEnd && ms(plannedEnd) > ms(job.start) && nowMs > ms(plannedEnd)) { closeJob(plannedEnd, true); flags.add("auto_ended"); }
    else if (!plannedEnd && nowMs - ms(job.start) > OPEN_JOB_MAX_MS) {
      // No schedule: end at his last real tap after the start, else start + 12 h; flag Auto-ended for review.
      const later = events.filter((e) => ms(e.at) > ms(job.start)).map((e) => e.at).pop();
      closeJob(later || new Date(ms(job.start) + OPEN_JOB_MAX_MS).toISOString(), true); flags.add("auto_ended");
    }
    else if (input.now) closeJob(input.now); // still working: count up to now
  }
  // Fill scheduled jobs with no taps at all.
  const tapped = new Set(jobs.map((job) => job.docId));
  for (const job of input.schedule) {
    if (tapped.has(job.docId) || !job.start || !job.end || ms(job.end) <= ms(job.start)) continue;
    if (Number.isFinite(nowMs) && ms(job.start) > nowMs) continue; // not happened yet
    jobs.push({ docId: job.docId, start: job.start, end: job.end, minutes: mins(job.start, job.end), fromSchedule: true, notAtSite: false, label: job.label });
    flags.add("from_schedule");
  }
  jobs.sort((a, b) => ms(a.start) - ms(b.start));
  if (jobs.some((job) => job.fromSchedule)) flags.add("from_schedule");
  if (jobs.length && openDrive) openDrive = null; // never pay an unfinished drive

  // Gaps between consecutive jobs: logged drive inside the gap is paid; otherwise short gaps are paid drive, long ones unpaid.
  let driveMinutes = 0, unpaidGap = 0;
  const legs: DriveLeg[] = [];
  for (let i = 1; i < jobs.length; i++) {
    const prev = jobs[i - 1], next = jobs[i];
    const gap = mins(prev.end, next.start);
    if (gap <= 0) continue;
    const logged = drives.filter((d) => ms(d.start) >= ms(prev.end) - 60000 && ms(d.end) <= ms(next.start) + 60000);
    const loggedMin = Math.min(gap, logged.reduce((sum, d) => sum + d.minutes, 0));
    let paid: number;
    if (gap <= settings.gapMinutes) paid = gap;
    else paid = loggedMin > 0 ? Math.min(loggedMin, gap) : 0;
    // A long gap with logged driving: pay at most the driving (and never a full free afternoon).
    if (gap > settings.gapMinutes && loggedMin > 0) paid = Math.min(paid, loggedMin);
    const expected = input.expectedDriveMinutes?.(prev.docId, next.docId);
    const actual = loggedMin > 0 ? loggedMin : paid;
    const long = expected !== undefined && actual > 0 && isLongDrive(actual, expected);
    if (long) flags.add("long_drive");
    legs.push({ fromDocId: prev.docId, toDocId: next.docId, start: prev.end, end: next.start, minutes: gap, paidMinutes: paid, expectedMinutes: expected, longDrive: long });
    driveMinutes += paid;
    unpaidGap += gap - paid;
  }
  // Overlapping jobs are counted once (union of time).
  let workMinutes = 0, cursor = 0;
  for (const job of jobs) {
    const s = ms(job.start), e = ms(job.end);
    if (e <= cursor) continue;
    workMinutes += (e - Math.max(s, cursor)) / 60000;
    cursor = e;
  }
  const paidMinutes = workMinutes + driveMinutes;
  return {
    employeeId: input.employeeId, date: input.date, jobs, drives: legs,
    workMinutes: round2(workMinutes), driveMinutes: round2(driveMinutes), unpaidGapMinutes: round2(unpaidGap),
    paidMinutes: round2(paidMinutes), paidHours: round2(paidMinutes / 60),
    flags: [...flags], autoEnded: flags.has("auto_ended"),
  };
}

/** "Long drive": more than 2x the expected time, or more than 30 minutes over it. */
export function isLongDrive(actualMinutes: number, expectedMinutes: number) {
  if (!(expectedMinutes > 0)) return false;
  return actualMinutes > expectedMinutes * 2 || actualMinutes > expectedMinutes + 30;
}

/** Straight-line estimate when there is no Maps key: haversine miles / 35 mph x 1.3 road factor. */
export function estimateDriveMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round((miles / 35) * 1.3 * 60);
}

/** Meters between two points (for the ~200 m job-site warning). */
export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const SITE_RADIUS_METERS = 200;

/** Should the portal ask "Still driving?" (transit open longer than the timeout). */
export function stillDrivingDue(events: TapEvent[], now: string, settings?: Partial<TimesheetSettings>) {
  const s = dayState(events);
  const limit = (settings?.transitTimeoutMinutes ?? DEFAULT_TIMESHEET_SETTINGS.transitTimeoutMinutes) * 60000;
  return s.state === "IN_TRANSIT" && Boolean(s.since) && ms(now) - ms(s.since!) > limit;
}

/** Per-job share of the day for job costing: job minutes, plus paid drive split evenly to the job driven to. */
export function jobMinutes(day: DaySheet, docId: string) {
  const own = day.jobs.filter((j) => j.docId === docId).reduce((sum, j) => sum + j.minutes, 0);
  const drive = day.drives.filter((d) => d.toDocId === docId).reduce((sum, d) => sum + d.paidMinutes, 0);
  return round2(own + drive);
}

export type FixRequest = { id: string; employeeId: string; date: string; eventId?: string; kind: TapKind; at: string; reason: string; status: "pending" | "approved" | "denied"; createdAt: string; decidedAt?: string; docId?: string };

/** Apply approved fix requests to the events (pending/denied leave them alone). History is kept by the caller. */
export function applyFixes(events: TapEvent[], fixes: FixRequest[]): TapEvent[] {
  let out = [...events];
  for (const fix of fixes.filter((f) => f.status === "approved")) {
    const target = fix.eventId ? out.find((e) => e.id === fix.eventId) : undefined;
    if (target) out = out.map((e) => (e.id === target.id ? { ...e, at: fix.at } : e));
    else out.push({ id: `fix-${fix.id}`, employeeId: fix.employeeId, date: fix.date, kind: fix.kind, at: fix.at, docId: fix.docId });
  }
  return out;
}
