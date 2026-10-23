/**
 * Day timesheet engine (pure: no storage, no network).
 * A worker's day is built from tap events and filled from the schedule where taps are missing.
 * Taps: Start day / Start job / Drive to next / Arrived / Start break / End break / End day (old "end_shift" = End day).
 * A strict state machine (OFF_DUTY, ON_DUTY_IDLE, WORKING, IN_TRANSIT, ON_BREAK) decides which taps are allowed;
 * an out-of-order tap is still counted (never dropped) and flags the day "out_of_order".
 *  - Paid day = first job start -> last job end (portal-to-portal: home commute unpaid unless the owner turns it on,
 *    or "start at the shop": the day starts at Start day and the drive to the first job is paid).
 *  - A gap between two jobs longer than gapMinutes (default 60) is unpaid, unless he logged driving inside it.
 *  - Shorter gaps are paid drive (default) or, with idleGapPaid off, only the logged driving in them is paid.
 *  - Breaks of shortBreakPaidMinutes (default 20) or more are unpaid; shorter breaks are paid.
 *  - Optional: auto meal deduction, California meal/rest checks + premium hours, long-drive auto-break, rounding.
 *  - Every new behaviour defaults to the pre-phase-1 result (except the new break taps, which only exist on new data).
 */
export type TapKind = "start_day" | "start_job" | "start_transit" | "arrive" | "break_start" | "break_end" | "end_day" | "end_shift";
export type TapEvent = {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD (worker's local day)
  kind: TapKind;
  at: string; // ISO (server time when the tap reached the server live; device time for queued offline taps)
  docId?: string; // the job (start_job / arrive) or the destination (start_transit)
  lat?: number;
  lng?: number;
  /** Set by the portal when GPS was off or the tap was farther than the geofence radius from the job. */
  notAtSite?: boolean;
  /** The phone's own clock at the tap (kept to spot a wrong phone clock). */
  deviceAt?: string;
  /** The worker confirmed an out-of-order tap. */
  outOfOrder?: boolean;
  /** Saved on the phone, not yet on the server. */
  pending?: boolean;
  /** Sent later from an offline queue: the phone time was kept (server time unknown). */
  offline?: boolean;
  /** Time set by an owner-approved fix (or an owner edit): never flagged out of order or clock skew. */
  fixed?: boolean;
  /** The original tapped time a fix replaced (shown struck through). */
  wasAt?: string;
};
export type ScheduledJob = { docId: string; start: string; end: string; label?: string; lat?: number; lng?: number }; // ISO start/end
export type DayFlag = "from_schedule" | "not_at_site" | "long_drive" | "auto_ended" | "fix_requested" | "edited" | "changed_since_approved"
  | "out_of_order" | "auto_meal" | "meal_missed" | "rest_missed" | "long_drive_break" | "clock_skew" | "offline_tap" | "ot" | "dt" | "before_hire";

export type BreakPreset = "federal" | "california";
/**
 * Per-worker overrides (employees.time_overrides jsonb -> Employee.timeOverrides; hire date is the existing employees.hire_date).
 * Missing/empty = the account rule.
 */
export type WorkerTimeOverrides = { breakPreset?: BreakPreset | ""; geofenceOptOut?: boolean; hireDate?: string;
  /** Phase 2 crew lead: his crew (employee ids) and what the owner lets him do. */
  lead?: boolean; crewIds?: string[]; leadPerms?: { seeHours: boolean; clockTeam: boolean };
  /** Phase 2 PTO override: off, own accrual (1 h per N worked), carried-in hours. */
  ptoOff?: boolean; ptoPerHours?: number; ptoStartHours?: number };
/** Read the overrides from an employee record ({ hireDate, timeOverrides } or raw row { hire_date, time_overrides }). */
export function readWorkerOverrides(employee: unknown): WorkerTimeOverrides {
  const e = (employee && typeof employee === "object" ? employee : {}) as Record<string, unknown>;
  const raw = (e.timeOverrides ?? e.time_overrides ?? {}) as Record<string, unknown>;
  const o = raw && typeof raw === "object" ? raw : {};
  const hire = String(e.hireDate ?? e.hire_date ?? "").slice(0, 10);
  return {
    breakPreset: o.breakPreset === "california" || o.breakPreset === "federal" ? o.breakPreset : "",
    geofenceOptOut: o.geofenceOptOut === true,
    hireDate: /^\d{4}-\d{2}-\d{2}$/.test(hire) ? hire : "",
    ...phase2Overrides(o),
  };
}
function phase2Overrides(o: Record<string, unknown>) {
  const out: Pick<WorkerTimeOverrides, "lead" | "crewIds" | "leadPerms" | "ptoOff" | "ptoPerHours" | "ptoStartHours"> = {};
  if (o.lead === true) out.lead = true;
  if (Array.isArray(o.crewIds)) out.crewIds = o.crewIds.map(String).filter(Boolean).slice(0, 100);
  if (o.leadPerms && typeof o.leadPerms === "object") { const p = o.leadPerms as Record<string, unknown>; out.leadPerms = { seeHours: p.seeHours !== false, clockTeam: p.clockTeam !== false }; }
  if (o.ptoOff === true) out.ptoOff = true;
  const per = Number(o.ptoPerHours); if (per > 0) out.ptoPerHours = per;
  const start = Number(o.ptoStartHours); if (start > 0) out.ptoStartHours = start;
  return out;
}
/** The employees.time_overrides value to save (hire date stays in employees.hire_date). */
export function timeOverridesRow(o: WorkerTimeOverrides): { breakPreset: BreakPreset | ""; geofenceOptOut: boolean } & ReturnType<typeof phase2Overrides> {
  return { breakPreset: o.breakPreset === "california" || o.breakPreset === "federal" ? o.breakPreset : "", geofenceOptOut: o.geofenceOptOut === true, ...phase2Overrides(o as Record<string, unknown>) };
}
/** Account settings with the worker's break preset applied (other settings unchanged). */
export function settingsForWorker(settings: Partial<TimesheetSettings> | undefined, worker?: WorkerTimeOverrides): Partial<TimesheetSettings> {
  return worker?.breakPreset ? { ...(settings || {}), breakPreset: worker.breakPreset } : settings || {};
}
export type OtPreset = "worker" | "federal" | "california" | "custom";
export type TimesheetSettings = {
  gapMinutes: number; transitTimeoutMinutes: number; halfDayHours: number;
  // Breaks
  shortBreakPaidMinutes: number; autoMealOn: boolean; autoMealAfterHours: number; autoMealMinutes: number;
  breakPreset: BreakPreset; caPremiumPay: boolean; idleGapPaid: boolean;
  // Travel (portal-to-portal)
  payFirstCommute: boolean; payLastCommute: boolean; startAtShop: boolean; commuteDeductMinutes: number; longDriveBreakMinutes: number;
  // Rounding of the paid day total: 0 = exact; 5 / 6 = nearest 5 / 6 minutes;
  // 15 = the "7-minute rule" (nearest quarter hour: 7 min or less rounds down, 8 or more rounds up).
  roundingMinutes: 0 | 5 | 6 | 15;
  // Location
  geofenceMeters: number; jobGeofence: Record<string, number>;
  // Overtime ("worker" = each worker's own overtime setting, today's behaviour)
  otPreset: OtPreset; weeklyOtHours: number; dailyOtHours: number; dailyDtHours: number; seventhDayRule: boolean; bonusInRegularRate: boolean;
  // Pay period (for export / period pickers). anchor = a period start date (YYYY-MM-DD) for biweekly.
  payPeriod: PayPeriod; payPeriodAnchor: string;
  // Reminders (foreground only)
  remindMissedStartMinutes: number; remindMissedEndMinutes: number;
  // Phase 2 pay rules
  /** Minimum wage per hour (0 = off). A week whose straight pay / hours is under it gets a top-up. */
  minWage: number;
  /** FLSA overtime for day-rate, piece, commission and set-amount pay: regular rate = week pay / hours, 0.5x for hours over 40. */
  flsaNonHourly: boolean;
  /** Task rates (prevailing wage / job rates): task name -> hourly rate that replaces the base wage on jobs of that task. */
  taskRates: Record<string, number>;
  /** Paid time off / sick: accrual of 1 hour per `ptoPerHours` hours worked (0 = off); caps in hours (0 = no cap). */
  ptoPreset: PtoPreset; ptoAllowNegative: boolean; ptoPerHours: number; ptoCapHours: number; ptoUseCapHours: number; ptoWaitDays: number;
};
export type PtoPreset = "off" | "federal" | "california" | "custom";
/** California paid sick leave: 1 h per 30 h worked, accrual cap 80 h, use cap 40 h (5 days) a year, usable after 90 days. */
export const CA_SICK = { ptoPerHours: 30, ptoCapHours: 80, ptoUseCapHours: 40, ptoWaitDays: 90 };
export const MIN_WAGE_PRESETS: { id: string; label: string; rate: number }[] = [
  { id: "off", label: "Off", rate: 0 }, { id: "federal", label: "Federal ($7.25)", rate: 7.25 }, { id: "california", label: "California ($16.90)", rate: 16.9 },
];
export type PayPeriod = "weekly" | "biweekly" | "semimonthly";
export const DEFAULT_TIMESHEET_SETTINGS: TimesheetSettings = {
  gapMinutes: 60, transitTimeoutMinutes: 120, halfDayHours: 4,
  shortBreakPaidMinutes: 20, autoMealOn: false, autoMealAfterHours: 6, autoMealMinutes: 30, breakPreset: "federal", caPremiumPay: false, idleGapPaid: true,
  payFirstCommute: false, payLastCommute: false, startAtShop: false, commuteDeductMinutes: 0, longDriveBreakMinutes: 0,
  roundingMinutes: 0, geofenceMeters: 200, jobGeofence: {},
  otPreset: "worker", weeklyOtHours: 40, dailyOtHours: 0, dailyDtHours: 0, seventhDayRule: false, bonusInRegularRate: true,
  payPeriod: "weekly", payPeriodAnchor: "", remindMissedStartMinutes: 15, remindMissedEndMinutes: 60,
  minWage: 0, flsaNonHourly: false, taskRates: {}, ptoPreset: "off", ptoAllowNegative: false, ptoPerHours: 0, ptoCapHours: 0, ptoUseCapHours: 0, ptoWaitDays: 0,
};
/** California preset values (applied by the Rules screen when the owner picks California). */
export const CALIFORNIA_RULES: Partial<TimesheetSettings> = { breakPreset: "california", shortBreakPaidMinutes: 20, otPreset: "california", weeklyOtHours: 40, dailyOtHours: 8, dailyDtHours: 12, seventhDayRule: true };

export type JobSpan = { docId: string; start: string; end: string; minutes: number; fromSchedule: boolean; notAtSite: boolean; label?: string; scheduledStart?: string; scheduledEnd?: string };
export type DriveLeg = { fromDocId?: string; toDocId?: string; start: string; end: string; minutes: number; paidMinutes: number; expectedMinutes?: number; longDrive?: boolean; commute?: "first" | "last"; autoBreakMinutes?: number };
export type BreakSpan = { start: string; end: string; minutes: number; paid: boolean; auto?: boolean; unpaidMinutes: number };
export type DaySheet = {
  employeeId: string;
  date: string;
  jobs: JobSpan[];
  drives: DriveLeg[];
  breaks: BreakSpan[];
  workMinutes: number;
  driveMinutes: number;
  unpaidGapMinutes: number;
  /** Unpaid break minutes subtracted (taken + auto meal). */
  breakMinutes: number;
  /** Long-drive excess treated as unpaid unless the owner approves the full drive. */
  autoBreakMinutes: number;
  /** Paid total change from rounding (+/-). */
  roundingMinutes: number;
  /** California missed meal/rest premium hours (paid at the regular rate, on top of hours). */
  premiumHours: number;
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
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TIMESHEET_SETTINGS;
  const pos = (value: unknown, fallback: number) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; };
  const nonneg = (value: unknown, fallback: number) => { const n = Number(value); return value !== undefined && value !== null && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback; };
  const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
  const rounding = Number(v.roundingMinutes);
  const jobGeofence: Record<string, number> = {};
  if (v.jobGeofence && typeof v.jobGeofence === "object") for (const [k, m] of Object.entries(v.jobGeofence as Record<string, unknown>)) { const n = Number(m); if (Number.isFinite(n) && n > 0) jobGeofence[k] = n; }
  const taskRates: Record<string, number> = {};
  if (v.taskRates && typeof v.taskRates === "object") for (const [k, m] of Object.entries(v.taskRates as Record<string, unknown>)) { const n = Number(m); if (k.trim() && Number.isFinite(n) && n > 0) taskRates[k.trim().slice(0, 40)] = n; }
  return {
    gapMinutes: pos(v.gapMinutes, d.gapMinutes),
    transitTimeoutMinutes: pos(v.transitTimeoutMinutes, d.transitTimeoutMinutes),
    halfDayHours: pos(v.halfDayHours, d.halfDayHours),
    shortBreakPaidMinutes: nonneg(v.shortBreakPaidMinutes, d.shortBreakPaidMinutes),
    autoMealOn: bool(v.autoMealOn, d.autoMealOn), autoMealAfterHours: pos(v.autoMealAfterHours, d.autoMealAfterHours), autoMealMinutes: pos(v.autoMealMinutes, d.autoMealMinutes),
    breakPreset: v.breakPreset === "california" ? "california" : "federal", caPremiumPay: bool(v.caPremiumPay, d.caPremiumPay), idleGapPaid: bool(v.idleGapPaid, d.idleGapPaid),
    payFirstCommute: bool(v.payFirstCommute, d.payFirstCommute), payLastCommute: bool(v.payLastCommute, d.payLastCommute), startAtShop: bool(v.startAtShop, d.startAtShop),
    commuteDeductMinutes: nonneg(v.commuteDeductMinutes, d.commuteDeductMinutes), longDriveBreakMinutes: nonneg(v.longDriveBreakMinutes, d.longDriveBreakMinutes),
    roundingMinutes: (rounding === 7 ? 15 : [0, 5, 6, 15].includes(rounding) ? rounding : 0) as TimesheetSettings["roundingMinutes"],
    geofenceMeters: pos(v.geofenceMeters, d.geofenceMeters), jobGeofence,
    otPreset: (["worker", "federal", "california", "custom"].includes(String(v.otPreset)) ? v.otPreset : "worker") as OtPreset,
    weeklyOtHours: nonneg(v.weeklyOtHours, d.weeklyOtHours), dailyOtHours: nonneg(v.dailyOtHours, d.dailyOtHours), dailyDtHours: nonneg(v.dailyDtHours, d.dailyDtHours),
    seventhDayRule: bool(v.seventhDayRule, d.seventhDayRule), bonusInRegularRate: bool(v.bonusInRegularRate, d.bonusInRegularRate),
    payPeriod: (["weekly", "biweekly", "semimonthly"].includes(String(v.payPeriod)) ? v.payPeriod : "weekly") as PayPeriod,
    payPeriodAnchor: typeof v.payPeriodAnchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.payPeriodAnchor) ? v.payPeriodAnchor : "",
    remindMissedStartMinutes: nonneg(v.remindMissedStartMinutes, d.remindMissedStartMinutes), remindMissedEndMinutes: nonneg(v.remindMissedEndMinutes, d.remindMissedEndMinutes),
    minWage: nonneg(v.minWage, 0), flsaNonHourly: bool(v.flsaNonHourly, false), taskRates,
    ptoPreset: (["off", "federal", "california", "custom"].includes(String(v.ptoPreset)) ? v.ptoPreset : "off") as PtoPreset, ptoAllowNegative: v.ptoAllowNegative === true,
    ...(v.ptoPreset === "california" ? CA_SICK : { ptoPerHours: v.ptoPreset === "custom" ? nonneg(v.ptoPerHours, 0) : 0, ptoCapHours: nonneg(v.ptoCapHours, 0), ptoUseCapHours: nonneg(v.ptoUseCapHours, 0), ptoWaitDays: nonneg(v.ptoWaitDays, 0) }),
  };
}

// ---------- State machine ----------
export type DayStateName = "OFF_DUTY" | "ON_DUTY_IDLE" | "WORKING" | "IN_TRANSIT" | "ON_BREAK";
export const normalizeKind = (kind: TapKind): Exclude<TapKind, "end_shift"> => (kind === "end_shift" ? "end_day" : kind);
/** Allowed transitions. Anything not listed is out of order (asked to confirm, then counted and flagged). */
export const TRANSITIONS: Record<DayStateName, Partial<Record<Exclude<TapKind, "end_shift">, DayStateName | "RESUME">>> = {
  OFF_DUTY: { start_day: "ON_DUTY_IDLE", start_job: "WORKING", start_transit: "IN_TRANSIT" }, // start_job/drive from off duty implies Start day (old data)
  ON_DUTY_IDLE: { start_job: "WORKING", arrive: "WORKING", start_transit: "IN_TRANSIT", break_start: "ON_BREAK", end_day: "OFF_DUTY" },
  WORKING: { start_job: "WORKING", start_transit: "IN_TRANSIT", break_start: "ON_BREAK", end_day: "OFF_DUTY" },
  IN_TRANSIT: { arrive: "WORKING", start_job: "WORKING", break_start: "ON_BREAK", end_day: "OFF_DUTY" },
  ON_BREAK: { break_end: "RESUME", end_day: "OFF_DUTY" },
};
const FALLBACK: Record<Exclude<TapKind, "end_shift">, DayStateName> = { start_day: "ON_DUTY_IDLE", start_job: "WORKING", arrive: "WORKING", start_transit: "IN_TRANSIT", break_start: "ON_BREAK", break_end: "ON_DUTY_IDLE", end_day: "OFF_DUTY" };
export function isAllowed(state: DayStateName, kind: TapKind) { return Boolean(TRANSITIONS[state][normalizeKind(kind)]); }
export function allowedTaps(state: DayStateName): Exclude<TapKind, "end_shift">[] { return Object.keys(TRANSITIONS[state]) as Exclude<TapKind, "end_shift">[]; }
/** Next state after a tap (out-of-order taps still move to the tap's natural state). */
export function step(cur: { state: DayStateName; resume: DayStateName; docId?: string }, event: Pick<TapEvent, "kind" | "docId">) {
  const kind = normalizeKind(event.kind);
  const target = TRANSITIONS[cur.state][kind];
  const ok = Boolean(target);
  let state: DayStateName = target === "RESUME" ? cur.resume : (target || FALLBACK[kind]);
  if (!ok && kind === "break_end") state = cur.state === "OFF_DUTY" ? cur.resume : cur.state; // no break open: stay put
  const resume = state === "ON_BREAK" ? (cur.state === "ON_BREAK" ? cur.resume : cur.state === "OFF_DUTY" ? "ON_DUTY_IDLE" : cur.state) : cur.resume;
  const docId = kind === "start_job" || kind === "arrive" || kind === "start_transit" ? event.docId || cur.docId : state === "OFF_DUTY" ? undefined : cur.docId;
  return { state, resume, docId, ok };
}

/** Current state of the worker from his taps (what the portal shows). */
export function dayState(events: TapEvent[]): { state: DayStateName; docId?: string; since?: string; outOfOrder: number } {
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  let cur: { state: DayStateName; resume: DayStateName; docId?: string } = { state: "OFF_DUTY", resume: "ON_DUTY_IDLE" };
  let since: string | undefined, bad = 0;
  for (const e of sorted) { const n = step(cur, e); if (!n.ok) bad++; cur = n; since = e.at; }
  return { state: cur.state, docId: cur.docId, since, outOfOrder: bad };
}

/**
 * Build one worker's day. `now` is used only to decide whether open transit / an open shift timed out;
 * a day in the past with no End day is always closed at the last real stop.
 */
const OPEN_JOB_MAX_MS = 12 * 3600000;
const CLOCK_SKEW_MS = 5 * 60000;

function overlap(a0: number, a1: number, b0: number, b1: number) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / 60000; }

export function buildDay(input: {
  employeeId: string;
  date: string;
  events: TapEvent[];
  schedule: ScheduledJob[];
  settings?: Partial<TimesheetSettings>;
  /** Optional per-worker overrides (readWorkerOverrides(employee)). */
  worker?: WorkerTimeOverrides;
  now?: string;
  expectedDriveMinutes?: (fromDocId: string | undefined, toDocId: string | undefined) => number | undefined;
}): DaySheet {
  const settings = { ...DEFAULT_TIMESHEET_SETTINGS, ...settingsForWorker(input.settings, input.worker) };
  const events = input.events.filter((e) => e.employeeId === input.employeeId && e.date === input.date).sort((a, b) => ms(a.at) - ms(b.at));
  const flags = new Set<DayFlag>();
  // Taps dated before the worker's hire date: flagged for the owner (pay is not changed automatically).
  if (input.worker?.hireDate && input.date < input.worker.hireDate && input.events.some((e) => e.employeeId === input.employeeId && e.date === input.date)) flags.add("before_hire");
  const jobs: JobSpan[] = [];
  const drives: DriveLeg[] = [];
  const breaks: { start: string; end?: string }[] = [];
  let openJob: { docId: string; start: string; notAtSite: boolean } | null = null;
  let openDrive: { from?: string; to?: string; start: string } | null = null;
  let lastJobDoc: string | undefined;
  let dayStart: string | undefined, dayEnd: string | undefined, trailingDrive: { start: string; end: string } | null = null;
  let cur: { state: DayStateName; resume: DayStateName; docId?: string } = { state: "OFF_DUTY", resume: "ON_DUTY_IDLE" };
  // Several sessions a day: Start day after End day re-opens the day. A session with no job taps is paid on-duty time.
  let session: { start: string; hadJob: boolean } | null = null;
  const sched = new Map(input.schedule.map((job) => [job.docId, job]));
  const closeJob = (at: string, fromSchedule = false) => {
    if (!openJob) return;
    jobs.push({ docId: openJob.docId, start: openJob.start, end: at, minutes: mins(openJob.start, at), fromSchedule, notAtSite: openJob.notAtSite, label: sched.get(openJob.docId)?.label });
    lastJobDoc = openJob.docId;
    openJob = null;
  };
  // Not at site: the portal's flag, or (when the job has a pin and the tap has GPS) farther than the job radius.
  // Geofence opt-out (radius 0): never flagged.
  const notAtSiteFor = (event: TapEvent) => {
    const radius = geofenceRadius(settings, event.docId, input.worker);
    if (!(radius > 0)) return false;
    const pin = event.docId ? sched.get(event.docId) : undefined;
    const kind = normalizeKind(event.kind);
    if ((kind === "start_job" || kind === "arrive") && pin?.lat != null && pin.lng != null && event.lat != null && event.lng != null) return Boolean(event.notAtSite) || metersBetween({ lat: event.lat, lng: event.lng }, { lat: pin.lat, lng: pin.lng }) > radius;
    return Boolean(event.notAtSite);
  };
  for (const event of events) {
    const kind = normalizeKind(event.kind);
    const next = step(cur, event);
    if ((!next.ok && !event.fixed) || (event.outOfOrder && !event.fixed)) flags.add("out_of_order");
    cur = next;
    const away = notAtSiteFor(event);
    if (away) flags.add("not_at_site");
    if (event.offline) flags.add("offline_tap");
    else if (event.deviceAt && Math.abs(ms(event.deviceAt) - ms(event.at)) > CLOCK_SKEW_MS) flags.add("clock_skew");
    const openBreak = breaks.length && !breaks[breaks.length - 1].end ? breaks[breaks.length - 1] : null;
    if (kind !== "break_start" && openBreak && kind !== "end_day") openBreak.end = event.at; // any tap ends an open break
    if (kind === "start_day") { if (!dayStart) dayStart = event.at; if (!session) session = { start: event.at, hadJob: false }; }
    else if (kind === "start_job" || kind === "arrive") {
      if (session) session.hadJob = true; else session = { start: event.at, hadJob: true };
      if (openDrive) { drives.push({ fromDocId: openDrive.from, toDocId: event.docId || openDrive.to, start: openDrive.start, end: event.at, minutes: mins(openDrive.start, event.at), paidMinutes: 0 }); openDrive = null; }
      if (openJob && openJob.docId !== event.docId) closeJob(event.at);
      if (!openJob && event.docId) openJob = { docId: event.docId, start: event.at, notAtSite: away };
    } else if (kind === "start_transit") {
      closeJob(event.at);
      if (!openDrive) openDrive = { from: lastJobDoc, to: event.docId, start: event.at };
    } else if (kind === "break_start") {
      if (!openBreak) breaks.push({ start: event.at });
    } else if (kind === "break_end") {
      if (openBreak) openBreak.end = event.at;
    } else if (kind === "end_day") {
      if (openBreak) openBreak.end = event.at;
      closeJob(event.at);
      if (openDrive) { if (openDrive.from) trailingDrive = { start: openDrive.start, end: event.at }; openDrive = null; } // drive home: paid only with "pay last commute"
      dayEnd = event.at;
      if (session && !session.hadJob && ms(event.at) > ms(session.start)) jobs.push({ docId: "", start: session.start, end: event.at, minutes: mins(session.start, event.at), fromSchedule: false, notAtSite: false, label: "On duty" });
      session = null;
    }
  }
  const nowMs = input.now ? ms(input.now) : Number.POSITIVE_INFINITY;
  // Open drive with no arrival: wait until the timeout, then end the day at the last real stop.
  if (openDrive) {
    const drive = openDrive as { from?: string; to?: string; start: string };
    if (nowMs - ms(drive.start) > settings.transitTimeoutMinutes * 60000) { flags.add("auto_ended"); openDrive = null; }
  }
  // Open break: closes now (still on break) or at the timeout.
  const lastBreak = breaks[breaks.length - 1];
  if (lastBreak && !lastBreak.end) lastBreak.end = Number.isFinite(nowMs) ? new Date(Math.min(nowMs, ms(lastBreak.start) + settings.transitTimeoutMinutes * 60000)).toISOString() : lastBreak.start;
  // Open job with no End day: close at the scheduled end (or the job start if none), once that time has passed.
  if (openJob) {
    const job = openJob as { docId: string; start: string; notAtSite: boolean };
    const plannedEnd = sched.get(job.docId)?.end;
    if (plannedEnd && ms(plannedEnd) > ms(job.start) && nowMs > ms(plannedEnd)) { closeJob(plannedEnd, true); flags.add("auto_ended"); }
    else if (!plannedEnd && nowMs - ms(job.start) > OPEN_JOB_MAX_MS) {
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
    // Real Start day / End day taps win: the scheduled fill-in is clipped to the day the worker actually tapped.
    const start = dayStart && ms(dayStart) > ms(job.start) ? dayStart : job.start;
    const end = dayEnd && ms(dayEnd) < ms(job.end) ? dayEnd : job.end;
    if (ms(end) <= ms(start)) continue;
    const clipped = start !== job.start || end !== job.end;
    jobs.push({ docId: job.docId, start, end, minutes: mins(start, end), fromSchedule: true, notAtSite: false, label: job.label, ...(clipped ? { scheduledStart: job.start, scheduledEnd: job.end } : {}) });
    flags.add("from_schedule");
  }
  jobs.sort((a, b) => ms(a.start) - ms(b.start));
  if (jobs.some((job) => job.fromSchedule)) flags.add("from_schedule");
  if (jobs.length && openDrive) openDrive = null; // never pay an unfinished drive

  // Gaps between consecutive jobs.
  let driveMinutes = 0, unpaidGap = 0, autoBreak = 0;
  const legs: DriveLeg[] = [];
  const longDriveCut = (leg: DriveLeg) => {
    if (!(settings.longDriveBreakMinutes > 0) || leg.paidMinutes <= settings.longDriveBreakMinutes) return;
    const excess = leg.paidMinutes - settings.longDriveBreakMinutes;
    leg.autoBreakMinutes = round2(excess); leg.paidMinutes -= excess; autoBreak += excess; flags.add("long_drive_break");
  };
  let reach = jobs[0];
  for (let i = 1; i < jobs.length; i++) {
    const prev = reach, next = jobs[i];
    if (ms(next.end) > ms(reach.end)) reach = next;
    const gap = mins(prev.end, next.start);
    if (gap <= 0) continue;
    const logged = drives.filter((d) => ms(d.start) >= ms(prev.end) - 60000 && ms(d.end) <= ms(next.start) + 60000);
    const loggedMin = Math.min(gap, logged.reduce((sum, d) => sum + d.minutes, 0));
    let paid: number;
    if (gap <= settings.gapMinutes) paid = settings.idleGapPaid ? gap : loggedMin;
    else paid = loggedMin > 0 ? Math.min(loggedMin, gap) : 0;
    const expected = input.expectedDriveMinutes?.(prev.docId, next.docId);
    const actual = loggedMin > 0 ? loggedMin : paid;
    const long = expected !== undefined && actual > 0 && isLongDrive(actual, expected);
    if (long) flags.add("long_drive");
    const leg: DriveLeg = { fromDocId: prev.docId, toDocId: next.docId, start: prev.end, end: next.start, minutes: gap, paidMinutes: paid, expectedMinutes: expected, longDrive: long };
    longDriveCut(leg);
    legs.push(leg);
    driveMinutes += leg.paidMinutes;
    unpaidGap += gap - paid;
  }
  // Portal-to-portal: first / last commute (off by default) and "start at the shop".
  if (jobs.length) {
    const first = jobs[0], last = jobs[jobs.length - 1];
    const firstDrive = drives.find((d) => ms(d.end) <= ms(first.start) + 60000 && !d.fromDocId);
    let leadStart: string | undefined, deduct = 0;
    if (settings.startAtShop && dayStart && ms(dayStart) < ms(first.start)) leadStart = dayStart;
    else if (settings.payFirstCommute && firstDrive) { leadStart = firstDrive.start; deduct = settings.commuteDeductMinutes; }
    if (leadStart) {
      const total = mins(leadStart, first.start);
      const leg: DriveLeg = { toDocId: first.docId, start: leadStart, end: first.start, minutes: total, paidMinutes: Math.max(0, total - deduct), commute: "first" };
      longDriveCut(leg);
      legs.unshift(leg); driveMinutes += leg.paidMinutes;
    }
    if (settings.payLastCommute && trailingDrive && ms(trailingDrive.start) >= ms(last.end) - 60000) {
      const total = mins(trailingDrive.start, trailingDrive.end);
      const leg: DriveLeg = { fromDocId: last.docId, toDocId: last.docId, start: trailingDrive.start, end: trailingDrive.end, minutes: total, paidMinutes: Math.max(0, total - settings.commuteDeductMinutes), commute: "last" };
      longDriveCut(leg);
      legs.push(leg); driveMinutes += leg.paidMinutes;
    }
  }
  void dayEnd;
  // Overlapping jobs are counted once (union of time).
  let workMinutes = 0, cursor = 0;
  for (const job of jobs) {
    const s = ms(job.start), e = ms(job.end);
    if (e <= cursor) continue;
    workMinutes += (e - Math.max(s, cursor)) / 60000;
    cursor = e;
  }
  // Breaks: unpaid when at least shortBreakPaidMinutes; only the part inside paid time is subtracted.
  const breakSpans: BreakSpan[] = [];
  let unpaidWork = 0, unpaidDrive = 0;
  for (const b of breaks) {
    if (!b.end) continue;
    const m = mins(b.start, b.end);
    const paid = m < settings.shortBreakPaidMinutes;
    let inWork = 0, inDrive = 0;
    if (!paid) {
      const s = ms(b.start), e = ms(b.end);
      let c2 = 0;
      for (const job of jobs) { const js = Math.max(ms(job.start), c2), je = ms(job.end); if (je <= c2) continue; inWork += overlap(s, e, js, je); c2 = je; }
      for (const leg of legs) inDrive += Math.min(leg.paidMinutes, overlap(s, e, ms(leg.start), ms(leg.end)));
    }
    unpaidWork += inWork; unpaidDrive += inDrive;
    breakSpans.push({ start: b.start, end: b.end, minutes: round2(m), paid, unpaidMinutes: round2(inWork + inDrive) });
  }
  workMinutes = Math.max(0, workMinutes - unpaidWork);
  driveMinutes = Math.max(0, driveMinutes - unpaidDrive);
  let breakMinutes = unpaidWork + unpaidDrive;
  // Auto meal deduction (off by default): no unpaid break taken and more than Y hours paid.
  const takenUnpaid = breakSpans.some((b) => !b.paid);
  if (settings.autoMealOn && !takenUnpaid && (workMinutes + driveMinutes) > settings.autoMealAfterHours * 60) {
    const cut = Math.min(settings.autoMealMinutes, workMinutes);
    workMinutes -= cut; breakMinutes += cut; flags.add("auto_meal");
    const at = jobs[0] ? new Date(ms(jobs[0].start) + settings.autoMealAfterHours * 3600000).toISOString() : input.date;
    breakSpans.push({ start: at, end: at, minutes: cut, paid: false, auto: true, unpaidMinutes: cut });
  }
  // California: 30-min meal starting before the 5th hour of work, 10-min rest per 4 hours (or major fraction).
  let premiumHours = 0;
  const firstStart = jobs[0] ? ms(jobs[0].start) : 0;
  const workedH = (workMinutes + driveMinutes) / 60;
  if (settings.breakPreset === "california" && jobs.length) {
    const real = breakSpans.filter((b) => !b.auto);
    const mealOk = workedH <= 5 || real.some((b) => b.minutes >= 30 && ms(b.start) <= firstStart + 5 * 3600000);
    const restNeeded = workedH < 3.5 ? 0 : Math.floor((workedH + 2) / 4);
    const restOk = real.filter((b) => b.minutes >= 10).length >= restNeeded;
    if (!mealOk) { flags.add("meal_missed"); if (settings.caPremiumPay) premiumHours += 1; }
    if (!restOk) { flags.add("rest_missed"); if (settings.caPremiumPay) premiumHours += 1; }
  }
  // Rounding of the day's paid total (nearest), the difference goes to work time.
  let paidMinutes = workMinutes + driveMinutes, roundingMinutes = 0;
  if (settings.roundingMinutes > 0 && paidMinutes > 0) {
    const step = settings.roundingMinutes, rem = paidMinutes % step;
    // Nearest step; the 15-min "7-minute rule": up to 7 min rounds down, 8+ rounds up (same as nearest for whole minutes).
    const r = step === 15 ? paidMinutes - rem + (rem >= 8 ? 15 : 0) : Math.round(paidMinutes / step) * step;
    roundingMinutes = r - paidMinutes; workMinutes = Math.max(0, workMinutes + roundingMinutes); paidMinutes = r;
  }
  return {
    employeeId: input.employeeId, date: input.date, jobs, drives: legs, breaks: breakSpans,
    workMinutes: round2(workMinutes), driveMinutes: round2(driveMinutes), unpaidGapMinutes: round2(unpaidGap),
    breakMinutes: round2(breakMinutes), autoBreakMinutes: round2(autoBreak), roundingMinutes: round2(roundingMinutes), premiumHours,
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
/** Geofence radius for a job: the job's own override, else the account radius (default 200 m). */
/** Job radius in meters; 0 when the worker opted out of geofence prompts (geofencePrompt then never prompts). */
export function geofenceRadius(settings: Partial<TimesheetSettings> | undefined, docId?: string, worker?: WorkerTimeOverrides) {
  if (worker?.geofenceOptOut) return 0;
  const own = docId ? settings?.jobGeofence?.[docId] : undefined;
  return own && own > 0 ? own : settings?.geofenceMeters && settings.geofenceMeters > 0 ? settings.geofenceMeters : SITE_RADIUS_METERS;
}
/** Foreground geofence prompt for MyDay: "arrive" when driving and inside the job radius, "leave" when working and outside it. Never blocks. */
export function geofencePrompt(state: DayStateName, pos: { lat: number; lng: number } | undefined, pin: { lat: number; lng: number } | null | undefined, radius: number): "arrive" | "leave" | null {
  if (!pos || !pin || !(radius > 0)) return null;
  const d = metersBetween(pos, pin);
  if ((state === "IN_TRANSIT" || state === "ON_DUTY_IDLE") && d <= radius) return "arrive";
  if (state === "WORKING" && d > radius * 1.5) return "leave";
  return null;
}

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

export type FixRequest = { id: string; employeeId: string; date: string; eventId?: string; kind: TapKind; at: string; reason: string; status: "pending" | "approved" | "denied"; createdAt: string; decidedAt?: string; docId?: string; ownerNote?: string };

/**
 * One copy of each tap: same id, or the same worker/day/kind within 2 seconds (a re-sent offline tap that got a new
 * id). The server copy wins over a phone-only copy. Re-syncing never adds hours.
 */
export function dedupeTaps(events: TapEvent[]): TapEvent[] {
  const byId = new Map<string, TapEvent>();
  for (const e of events) { const had = byId.get(e.id); if (!had || (had.pending && !e.pending)) byId.set(e.id, e); }
  const out: TapEvent[] = [];
  for (const e of [...byId.values()].sort((a, b) => (a.pending === b.pending ? 0 : a.pending ? 1 : -1))) {
    const t = new Date(e.at).getTime();
    if (out.some((x) => x.employeeId === e.employeeId && x.date === e.date && normalizeKind(x.kind) === normalizeKind(e.kind) && x.docId === e.docId && Math.abs(new Date(x.at).getTime() - t) < 2000)) continue;
    out.push(e);
  }
  return out;
}

/** Apply approved fix requests to the events (pending/denied leave them alone). History is kept by the caller. */
export function applyFixes(events: TapEvent[], fixes: FixRequest[]): TapEvent[] {
  let out = [...events];
  for (const fix of fixes.filter((f) => f.status === "approved")) {
    // A start/end-of-day fix without an event id replaces that day's own start/end tap (one per day), never adds a second.
    const target = fix.eventId ? out.find((e) => e.id === fix.eventId)
      : (fix.kind === "start_day" || fix.kind === "end_day") ? out.find((e) => e.kind === fix.kind && e.date === fix.date && (!e.employeeId || !fix.employeeId || e.employeeId === fix.employeeId) && !e.fixed) : undefined;
    // A fixed tap is the owner-approved time: no phone time (no clock_skew) and never "out of order".
    if (target) out = out.map((e) => (e.id === target.id ? { ...e, at: fix.at, deviceAt: undefined, outOfOrder: false, fixed: true, wasAt: e.at } : e));
    else out.push({ id: `fix-${fix.id}`, employeeId: fix.employeeId, date: fix.date, kind: fix.kind, at: fix.at, docId: fix.docId, fixed: true });
  }
  return out;
}

/** Flags that need the owner's eye before a day is "ready" (an owner edit counts as reviewed). */
export const REVIEW_FLAGS: DayFlag[] = ["from_schedule", "not_at_site", "long_drive", "auto_ended", "fix_requested", "out_of_order", "meal_missed", "rest_missed", "long_drive_break", "clock_skew", "offline_tap", "before_hire"];
export const needsReview = (flags: string[], edited = false) => !edited && flags.some((f) => (REVIEW_FLAGS as string[]).includes(f));

/**
 * Business time zone: every time on the timesheet and the crew portal is shown (and every typed time is read) in the
 * account's zone (profiles.timezone, default America/Chicago), never the phone/browser zone, so owner and crew agree.
 */
let BIZ_TZ = "America/Chicago";
export function setBusinessTz(tz?: string | null) {
  if (!tz) return;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); BIZ_TZ = tz; } catch { /* not a valid zone: keep */ }
}
export const businessTz = () => BIZ_TZ;
const partsIn = (t: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: BIZ_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
};
/** "10:16 PM" in the business zone. */
export const fmtTime = (iso: string) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BIZ_TZ }) : "");
/** "22:16" (for time inputs) in the business zone. */
export const hhmmTz = (iso: string) => { const p = partsIn(new Date(iso).getTime()); return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`; };
/** "2026-10-22": the business-zone date of an instant. */
export const ymdTz = (d: Date) => { const p = partsIn(d.getTime()); return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
/** A wall-clock date + "HH:MM" in the business zone as an ISO instant (DST safe). */
export function wallToIso(date: string, hhmm: string) {
  if (!date || !/^\d{1,2}:\d{2}/.test(hhmm || "")) return "";
  const [y, mo, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = (t: number) => { const p = partsIn(t); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t; };
  let t = guess - off(guess);
  const o2 = off(t); if (guess - o2 !== t) t = guess - o2;
  return new Date(t).toISOString();
}
/** "2 h 10 m" / "40 m" / "<1 m" (any time under half a minute that is not zero). Never negative. */
export function hm(minutes: number) {
  const raw = Math.max(0, minutes || 0);
  if (raw > 0 && raw < 0.5) return "<1 m";
  const m = Math.round(raw), hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh} h${mm ? ` ${mm} m` : ""}` : `${mm} m`;
}
/** Break / stopwatch clock "m:ss", clamped at 0 (never "-1:-8"). */
export function clockMs(msIn: number) { const t = Math.max(0, Math.floor((msIn || 0) / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; }

/** Plain-English reason for each flag on a day (shown on the day detail). */
export function flagReasons(day: DaySheet | undefined, extra: string[] = [], settings: Partial<TimesheetSettings> = {}): { flag: string; text: string }[] {
  const s = { ...DEFAULT_TIMESHEET_SETTINGS, ...settings };
  const flags = [...new Set([...(day?.flags || []), ...extra])];
  return flags.map((flag) => {
    switch (flag) {
      case "from_schedule": {
        const missed = (day?.jobs || []).filter((j) => j.fromSchedule).map((j) => j.label || "a job");
        return { flag, text: `No tap was recorded for ${missed.length ? missed.join(", ") : "part of the day"}, so the scheduled time was used. Check it's right.` };
      }
      case "not_at_site": return { flag, text: `A tap was made with GPS off or more than ${s.geofenceMeters} m from the job site.` };
      case "out_of_order": return { flag, text: "A tap was made out of order (for example End break with no break started). It was counted; check the times." };
      case "auto_meal": return { flag, text: `No unpaid break was taken, so a ${s.autoMealMinutes}-minute meal break was taken off after ${s.autoMealAfterHours} hours.` };
      case "meal_missed": return { flag, text: `No 30-minute meal break started before the 5th hour (California rule).${s.caPremiumPay ? " One hour of premium pay was added." : ""}` };
      case "rest_missed": return { flag, text: `Not enough 10-minute rest breaks (one per 4 hours, California rule).${s.caPremiumPay ? " One hour of premium pay was added." : ""}` };
      case "long_drive_break": return { flag, text: `A drive ran over ${s.longDriveBreakMinutes} min ` + `(${hm(day?.autoBreakMinutes || 0)} extra). The extra is unpaid unless you tap "Pay the full drive".` };
      case "clock_skew": return { flag, text: "The worker's phone clock was more than 5 minutes off from the server. The server time was used." };
      case "offline_tap": return { flag, text: "A tap was saved on the phone with no signal and sent later, so the phone's own clock time was used. Check it's right." };
      case "before_hire": return { flag, text: "Time was logged before this worker's hire date. Check the hire date or the day." };
      case "long_drive": {
        const leg = (day?.drives || []).find((d) => d.longDrive);
        return { flag, text: leg ? `A drive took ${hm(leg.paidMinutes || leg.minutes)}, but about ${hm(leg.expectedMinutes || 0)} was expected.` : "A drive took much longer than expected." };
      }
      case "auto_ended": return { flag, text: `The day was never ended (or "Still driving?" went unanswered after ${s.transitTimeoutMinutes} min), so it was ended at the last real stop.` };
      case "fix_requested": return { flag, text: "The worker asked for a time fix. Approve or deny it below." };
      case "edited": return { flag, text: "You edited this day's hours." };
      case "changed_since_approved": return { flag, text: "Hours changed after you approved them. Approve again." };
      default: return { flag, text: flag };
    }
  });
}

/** Worker-facing wording for the same flags (no owner actions like "Approve or deny it below"). */
export function crewFlagReasons(day: DaySheet | undefined, extra: string[] = [], settings: Partial<TimesheetSettings> = {}): { flag: string; text: string }[] {
  const s = { ...DEFAULT_TIMESHEET_SETTINGS, ...settings };
  return flagReasons(day, extra, settings).map(({ flag, text }) => {
    switch (flag) {
      case "from_schedule": return { flag, text: "No tap was recorded for part of the day, so your scheduled time was used. Ask your boss for a fix if it's wrong." };
      case "not_at_site": return { flag, text: `A tap was made with GPS off or more than ${s.geofenceMeters} m from the job site. Your boss will check it.` };
      case "out_of_order": return { flag, text: "A tap was made out of order (for example End break with no break started). It still counts; your boss will check the times." };
      case "long_drive_break": return { flag, text: `A drive ran over ${s.longDriveBreakMinutes} min, so the extra may be unpaid. Your boss decides.` };
      case "clock_skew": return { flag, text: "Your phone's clock was more than 5 minutes off, so the server time was used." };
      case "offline_tap": return { flag, text: "A tap was saved with no signal and sent later, so your phone's time was used. Your boss will check it." };
      case "before_hire": return { flag, text: "Time was logged before your hire date. Your boss will check it." };
      case "auto_ended": return { flag, text: `Your day was never ended (or "Still driving?" went unanswered after ${s.transitTimeoutMinutes} min), so it was ended at your last real stop.` };
      case "fix_requested": return { flag, text: "You asked for a time fix. Your boss will approve or deny it." };
      case "edited": return { flag, text: "Your boss edited this day's hours." };
      case "changed_since_approved": return { flag, text: "Your hours changed after your boss approved them. They'll need approving again." };
      default: return { flag, text };
    }
  });
}

/** Timeline rows for a day: job starts/ends, drives and gaps (paid or unpaid), in time order. */
export type TimelineRow = { at: string; kind: "start" | "end" | "gap" | "break"; text: string; paid?: boolean; minutes?: number; docId?: string; fromSchedule?: boolean };
export function dayTimeline(day: DaySheet | undefined): TimelineRow[] {
  if (!day || !day.jobs.length) return [];
  const rows: TimelineRow[] = [];
  // The day ends at the latest end (overlapping schedule fill-ins can end before an earlier-started job).
  const last = day.jobs.reduce((a, b) => (ms(b.end) >= ms(a.end) ? b : a));
  day.jobs.forEach((job) => {
    rows.push({ at: job.start, kind: "start", docId: job.docId, fromSchedule: job.fromSchedule, text: !job.docId ? `${fmtTime(job.start)} Day started (no job)` : `${fmtTime(job.start)} Started ${job.label || "job"}${job.fromSchedule ? " (from schedule)" : ""}` });
    const leg = day.drives.find((d) => d.fromDocId === job.docId && d.start === job.end);
    if (leg && job !== last) {
      rows.push({ at: job.end, kind: "end", docId: job.docId, text: `${fmtTime(job.end)} Finished ${job.label || "job"}` });
      const unpaid = leg.minutes - leg.paidMinutes;
      rows.push({ at: leg.start, kind: "gap", minutes: leg.minutes, paid: unpaid < 0.5,
        text: unpaid < 0.5 ? `Drive ${hm(leg.paidMinutes)} (paid)` : leg.paidMinutes > 0 ? `Gap ${hm(leg.minutes)}: drive ${hm(leg.paidMinutes)} paid, ${hm(unpaid)} unpaid` : `Gap ${hm(leg.minutes)} (unpaid)` });
    } else if (job !== last) rows.push({ at: job.end, kind: "end", docId: job.docId, text: `${fmtTime(job.end)} Finished ${job.label || "job"}` });
  });
  for (const leg of day.drives.filter((d) => d.commute)) rows.push({ at: leg.start, kind: "gap", minutes: leg.minutes, paid: true, text: `${fmtTime(leg.start)} ${leg.commute === "first" ? "Travel to first job" : "Drive home"} ${hm(leg.paidMinutes)} (paid${leg.minutes - leg.paidMinutes >= 0.5 ? `, ${hm(leg.minutes - leg.paidMinutes)} not paid` : ""})` });
  for (const b of day.breaks || []) rows.push({ at: b.start, kind: "break", minutes: b.minutes, paid: b.paid, text: b.auto ? `Auto meal break ${hm(b.minutes)} (unpaid)` : `${fmtTime(b.start)} Break ${hm(b.minutes)} (${b.paid ? "paid, short break" : "unpaid"})` });
  for (const leg of day.drives.filter((d) => d.autoBreakMinutes)) rows.push({ at: leg.end, kind: "break", minutes: leg.autoBreakMinutes, paid: false, text: `Long drive: ${hm(leg.autoBreakMinutes || 0)} over the limit treated as an unpaid break` });
  rows.push({ at: last.end, kind: "end", docId: last.docId, text: `${fmtTime(last.end)} Day ended${day.autoEnded ? " (auto-ended at the last stop)" : ""}` });
  for (const job of day.jobs) if (job.fromSchedule && job.scheduledStart) rows.push({ at: job.start, kind: "gap", paid: true, fromSchedule: true, docId: job.docId, text: `Scheduled ${fmtTime(job.scheduledStart)}–${fmtTime(job.scheduledEnd || job.end)}; counted only ${fmtTime(job.start)}–${fmtTime(job.end)} (inside the real Start day / End day taps)` });
  rows.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.kind === "end" ? 1 : 0) - (b.kind === "end" ? 1 : 0));
  return rows;
}

/** "Paid 7 h 30 m = jobs 6 h 50 m + drive 40 m. Unpaid gap 2 h 10 m." */
export function daySummary(day: DaySheet | undefined, paidOverride?: number | null) {
  if (!day) return "No hours.";
  const paid = paidOverride ?? day.paidMinutes;
  const base = `Paid ${hm(paid)} = jobs ${hm(day.workMinutes)} + drive ${hm(day.driveMinutes)}.`;
  const edited = paidOverride != null && Math.round(paidOverride) !== Math.round(day.paidMinutes) ? ` (You set ${hm(paidOverride)}; taps show ${hm(day.paidMinutes)}.)` : "";
  const extras = `${day.breakMinutes >= 0.5 ? ` Unpaid breaks ${hm(day.breakMinutes)}.` : ""}${Math.abs(day.roundingMinutes || 0) >= 0.5 ? ` Rounded ${day.roundingMinutes > 0 ? "+" : "−"}${hm(Math.abs(day.roundingMinutes))}.` : ""}${day.premiumHours ? ` Premium pay ${day.premiumHours} h.` : ""}`;
  return `${paidOverride != null && edited ? `Paid ${hm(paid)}.${edited}` : base}${day.unpaidGapMinutes >= 0.5 ? ` Unpaid gap ${hm(day.unpaidGapMinutes)}.` : ""}${extras}`;
}

/** A worker's week status from his days: Needs review (n) / Ready to approve / Approved / No hours. */
export type WeekStatus = { kind: "none" | "review" | "ready" | "approved"; review: number; ready: number; approved: number; label: string };
/** One day's review info, the same rule the timesheet grid uses (edited minutes win, approved minutes, else the sheet). */
export function reviewDayInfo(sheet: DaySheet | undefined, a?: { paidMinutes: number; editedMinutes?: number | null; approvedAt?: string | null }) {
  const mins = a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : sheet?.paidMinutes || 0;
  return { mins, approved: Boolean(a?.approvedAt), flagged: needsReview(sheet?.flags || [], a?.editedMinutes != null), hasHours: mins > 0 };
}
/** "Needs review" day count for a week (timesheet "Needs review only" and the dashboard use this one count). */
export function reviewCount(workerIds: string[], days: string[], sheets: Map<string, DaySheet>, approvals: { employeeId: string; date: string; paidMinutes: number; editedMinutes?: number | null; approvedAt?: string | null }[]) {
  let n = 0;
  for (const id of workerIds) n += weekStatus(days.map((d) => reviewDayInfo(sheets.get(`${id}|${d}`), approvals.find((a) => a.employeeId === id && a.date === d)))).review;
  return n;
}
export function weekStatus(days: { hasHours: boolean; approved: boolean; flagged: boolean }[]): WeekStatus {
  const worked = days.filter((d) => d.hasHours);
  const approved = worked.filter((d) => d.approved).length;
  const review = worked.filter((d) => !d.approved && d.flagged).length;
  const ready = worked.filter((d) => !d.approved && !d.flagged).length;
  if (!worked.length) return { kind: "none", review, ready, approved, label: "No hours" };
  if (review) return { kind: "review", review, ready, approved, label: `Needs review (${review})` };
  if (ready) return { kind: "ready", review, ready, approved, label: "Ready to approve" };
  return { kind: "approved", review, ready, approved, label: "Approved ✓" };
}


// ---------- Shared helpers for the UI workers (phase 1 foundation) ----------
export type NextAction = { kind: Exclude<TapKind, "end_shift">; primary: boolean; destructive: boolean };
/** Valid taps for a state, the main next step first. End day is marked destructive (keep it away from the main button). */
export function nextActions(state: DayStateName, opts: { hasNextJob?: boolean; tapsToday?: number } = {}): NextAction[] {
  const order: Record<DayStateName, Exclude<TapKind, "end_shift">[]> = {
    OFF_DUTY: opts.tapsToday ? [] : ["start_day", "start_job", "start_transit"],
    ON_DUTY_IDLE: opts.hasNextJob === false ? ["start_job", "arrive", "break_start", "start_transit", "end_day"] : ["start_transit", "start_job", "arrive", "break_start", "end_day"],
    IN_TRANSIT: ["arrive", "start_job", "break_start", "end_day"],
    WORKING: opts.hasNextJob ? ["start_transit", "break_start", "start_job", "end_day"] : ["break_start", "start_transit", "start_job", "end_day"],
    ON_BREAK: ["break_end", "end_day"],
  };
  const allowed = new Set(allowedTaps(state));
  return order[state].filter((k) => allowed.has(k)).map((kind, i) => ({ kind, primary: i === 0 && kind !== "end_day" && !(state === "WORKING" && !opts.hasNextJob && kind === "break_start"), destructive: kind === "end_day" }));
}

/** Pay period containing `date` (YYYY-MM-DD). Weeks start Monday. */
export function payPeriodOf(date: string, period: PayPeriod, anchor = ""): { from: string; to: string } {
  const d = new Date(`${date}T12:00:00`);
  const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const plus = (x: Date, n: number) => { const y = new Date(x); y.setDate(y.getDate() + n); return y; };
  if (period === "semimonthly") {
    const first = d.getDate() <= 15;
    return { from: ymd(new Date(d.getFullYear(), d.getMonth(), first ? 1 : 16, 12)), to: ymd(first ? new Date(d.getFullYear(), d.getMonth(), 15, 12) : new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) };
  }
  const monday = plus(d, -((d.getDay() + 6) % 7));
  if (period === "weekly") return { from: ymd(monday), to: ymd(plus(monday, 6)) };
  const a = anchor ? new Date(`${anchor}T12:00:00`) : new Date("2026-01-05T12:00:00");
  const aMon = plus(a, -((a.getDay() + 6) % 7));
  const weeks = Math.round((monday.getTime() - aMon.getTime()) / (7 * 86400000));
  const start = plus(monday, -(((weeks % 2) + 2) % 2) * 7);
  return { from: ymd(start), to: ymd(plus(start, 13)) };
}

/** Who is on the clock now, from today's taps (any order). */
export type OnClock = { employeeId: string; state: DayStateName; since?: string; docId?: string };
export function whosOnClock(events: TapEvent[], today: string): OnClock[] {
  const by = new Map<string, TapEvent[]>();
  for (const e of events) if (e.date === today) by.set(e.employeeId, [...(by.get(e.employeeId) || []), e]);
  return [...by.entries()].map(([employeeId, list]) => ({ employeeId, ...dayState(list) })).filter((x) => x.state !== "OFF_DUTY").map(({ outOfOrder: _o, ...rest }) => rest);
}

/** Minutes the first tap came after the first planned start, past the grace (15 min): 0 when on time. Same rule as the owner's "Started late". */
export function lateStartMinutes(taps: TapEvent[], schedule: ScheduledJob[], graceMinutes = 15) {
  const first = [...schedule].sort((a, b) => ms(a.start) - ms(b.start))[0];
  const tap = [...taps].sort((a, b) => ms(a.at) - ms(b.at))[0];
  if (!first || !tap) return 0;
  const late = (ms(tap.at) - ms(first.start)) / 60000;
  return late > graceMinutes ? Math.round(late) : 0;
}

/** Owner alerts (in-app). No money in them. */
export type TimeAlertKind = "fix_pending" | "needs_review" | "out_of_order" | "clock_skew" | "forgot_end" | "late_start" | "no_show" | "break_rule" | "changed_since_approved";
export type TimeAlert = { kind: TimeAlertKind; employeeId: string; date: string; text: string };
const COVERED_BY_ALERT = new Set<DayFlag>(["fix_requested", "meal_missed", "rest_missed", "clock_skew", "out_of_order"]);
export function timeAlerts(input: { sheets: Map<string, DaySheet>; fixes: FixRequest[]; events: TapEvent[]; today: string; schedule?: Map<string, ScheduledJob[]>; now?: string; lateMinutes?: number }): TimeAlert[] {
  const out: TimeAlert[] = [];
  for (const f of input.fixes) if (f.status === "pending") out.push({ kind: "fix_pending", employeeId: f.employeeId, date: f.date, text: "Asked for a time fix" });
  for (const s of input.sheets.values()) {
    if (s.flags.includes("meal_missed") || s.flags.includes("rest_missed")) out.push({ kind: "break_rule", employeeId: s.employeeId, date: s.date, text: "Break rule missed" });
    if (s.flags.includes("clock_skew")) out.push({ kind: "clock_skew", employeeId: s.employeeId, date: s.date, text: "Phone clock was off" });
    if (s.flags.includes("out_of_order")) out.push({ kind: "out_of_order", employeeId: s.employeeId, date: s.date, text: "Taps out of order" });
    // "Needs review" only for review flags no specific alert already covers.
    else if (needsReview(s.flags.filter((f) => !COVERED_BY_ALERT.has(f)))) out.push({ kind: "needs_review", employeeId: s.employeeId, date: s.date, text: "Day needs review" });
    if (s.date < input.today && s.autoEnded) out.push({ kind: "forgot_end", employeeId: s.employeeId, date: s.date, text: "Day was never ended" });
  }
  const nowMs = input.now ? ms(input.now) : NaN;
  if (input.schedule && Number.isFinite(nowMs)) for (const [key, jobs] of input.schedule) {
    const [employeeId, date] = key.split("|");
    if (date !== input.today || !jobs.length) continue;
    const first = jobs.reduce((a, b) => (ms(a.start) <= ms(b.start) ? a : b));
    const taps = input.events.filter((e) => e.employeeId === employeeId && e.date === date).sort((a, b) => ms(a.at) - ms(b.at));
    const late = (input.lateMinutes ?? 15) * 60000;
    if (!taps.length && nowMs > ms(first.end)) out.push({ kind: "no_show", employeeId, date, text: "No taps for a scheduled job" });
    else if ((!taps.length && nowMs > ms(first.start) + late) || (taps.length && ms(taps[0].at) > ms(first.start) + late)) out.push({ kind: "late_start", employeeId, date, text: "Started late" });
  }
  // One alert per worker/day/kind (fixes, flags and schedule checks can overlap).
  const seen = new Set<string>();
  return out.filter((a) => { const k = `${a.employeeId}|${a.date}|${a.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
