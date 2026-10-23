/**
 * Storage for the day timesheet: tap events, fix requests, day approvals, settings.
 * Supabase first (migration 20261026110000_crew_timesheets); when the tables/functions are not there yet,
 * everything keeps working on this device's localStorage. A worker only ever writes his own taps.
 */
import { supabase } from "@/lib/supabase";
import { readTimesheetSettings, readWorkerOverrides, setBusinessTz, ymdTz, dedupeTaps, type WorkerTimeOverrides, type FixRequest, type TapEvent, type TapKind, type TimesheetSettings } from "@/lib/timesheet";

const missing = (error: { message?: string; code?: string } | null | undefined) =>
  Boolean(error && /could not find|does not exist|PGRST202|PGRST205|42P01|42883|schema cache/i.test(`${error.message || ""} ${error.code || ""}`));

const KEY_EVENTS = "clientready-day-events";
const KEY_FIXES = "clientready-time-fixes";
const KEY_APPROVALS = "clientready-day-approvals";
const KEY_SETTINGS = "clientready-timesheet-settings";
function readLocal<T>(key: string, fallback: T): T {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeLocal(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: Supabase still has it */ }
}

/** The business-zone date (account time zone), not the phone's zone. */
export const localDate = (d: Date) => ymdTz(d);
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

type EventRow = { id: string; employee_id: string; work_date: string; kind: TapKind; at: string; doc_id: string; lat: number | null; lng: number | null; not_at_site: boolean; device_at?: string | null; out_of_order?: boolean | null; offline?: boolean | null; created_at?: string };
const fromRow = (row: EventRow): TapEvent => ({ id: row.id, employeeId: row.employee_id, date: String(row.work_date).slice(0, 10), kind: row.kind, at: row.at, docId: row.doc_id || undefined, ...(row.lat != null ? { lat: row.lat } : {}), ...(row.lng != null ? { lng: row.lng } : {}), notAtSite: Boolean(row.not_at_site), ...(row.device_at ? { deviceAt: row.device_at } : {}), ...(row.out_of_order ? { outOfOrder: true } : {}), ...(row.offline ? { offline: true } : {}) });
const EVENT_COLS = "id,employee_id,work_date,kind,at,doc_id,lat,lng,not_at_site";
const EVENT_COLS_P0 = `${EVENT_COLS},device_at,out_of_order,created_at`;
const EVENT_COLS_P1 = `${EVENT_COLS_P0},offline`;
/** Select events with the phase-1 columns, falling back to the old columns on a server without the migration. */
async function selectEvents(build: (cols: string) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>) {
  const first = await build(EVENT_COLS_P1);
  const bad = (r: typeof first) => Boolean(r.error && /column|42703/i.test(`${r.error.message} ${r.error.code}`));
  if (!bad(first)) return first;
  const second = await build(EVENT_COLS_P0);
  return bad(second) ? build(EVENT_COLS) : second;
}

/** Best-effort GPS (never blocks: 6 s timeout, denied = undefined). */
export function currentPosition(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(undefined);
    const timer = window.setTimeout(() => resolve(undefined), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { window.clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { window.clearTimeout(timer); resolve(undefined); },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
}

/**
 * Location permission as the browser reports it: "granted" / "denied" / "prompt", or "unknown" when the browser has
 * no Permissions API. Only "denied" means location is off; a slow GPS fix (timeout) is not "off".
 */
export async function locationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return st.state as "granted" | "denied" | "prompt";
  } catch { return "unknown"; }
}

/** The account's time zone (profiles.timezone) for showing every time the same on every device. */
let tzLoaded: Promise<void> | null = null;
const rememberTz = (tz: string) => { try { window.localStorage.setItem("clientready-business-tz", tz); } catch { /* private mode */ } };
/** Loads the account time zone once per page load (all day keys and times use it). */
export function loadBusinessTz(asCrew = false) { return (tzLoaded ||= loadBusinessTzOnce(asCrew)); }
async function loadBusinessTzOnce(asCrew: boolean) {
  try {
    if (asCrew) {
      // crew_time_zone (phase 2); else crew_time_rules().timezone; else the last zone seen on this device; default stays America/Chicago (never the device/UTC zone).
      const { data, error } = await supabase.rpc("crew_time_zone");
      if (!error && typeof data === "string" && data) { setBusinessTz(data); rememberTz(data); return; }
      const r = await supabase.rpc("crew_time_rules");
      const tz = (r.data as { timezone?: string } | null)?.timezone;
      if (tz) { setBusinessTz(tz); rememberTz(tz); return; }
      try { setBusinessTz(window.localStorage.getItem("clientready-business-tz")); } catch { /* none */ }
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase.from("profiles").select("timezone").eq("id", u.user.id).maybeSingle();
    const tz = (data as { timezone?: string | null } | null)?.timezone;
    setBusinessTz(tz); if (tz) rememberTz(tz);
  } catch { /* keep the default zone */ }
}

/** Worker: the owner's decision per day (approved / edited minutes): the one number both sides show. Hours only. */
export type MyDayStatus = { date: string; minutes: number | null; approved: boolean; changed: boolean };
export async function loadMyDayStatus(from: string, to: string): Promise<MyDayStatus[]> {
  const { data, error } = await supabase.rpc("crew_my_day_status", { p_from: from, p_to: to });
  if (error || !Array.isArray(data)) return [];
  return (data as { work_date: string; minutes: number | null; approved: boolean; changed: boolean }[]).map((r) => ({ date: String(r.work_date).slice(0, 10), minutes: r.minutes == null ? null : Number(r.minutes), approved: Boolean(r.approved), changed: Boolean(r.changed) }));
}

/** Worker: record a tap. Saved on the phone first, then sent (an older server keeps the phone copy). */
export async function recordTap(event: Omit<TapEvent, "id"> & { id?: string }, email: string) {
  const full: TapEvent = { ...event, id: event.id || newId(), deviceAt: event.deviceAt || event.at };
  const key = `${KEY_EVENTS}:${email.toLowerCase()}`;
  writeLocal(key, [...readLocal<TapEvent[]>(key, []).filter((e) => e.id !== full.id), { ...full, pending: true }]);
  const base = { p_id: full.id, p_kind: full.kind, p_at: full.at, p_work_date: full.date, p_doc_id: full.docId || "", p_lat: full.lat ?? null, p_lng: full.lng ?? null, p_not_at_site: Boolean(full.notAtSite) };
  // Phase 1 server: stores the server time (live taps), the phone time and the out-of-order confirm.
  // A replayed offline tap (still pending on the phone) keeps the phone time on the server and is marked offline.
  const offline = Boolean((event as TapEvent).pending);
  let { error } = await supabase.rpc("crew_add_day_event", { ...base, p_device_at: full.deviceAt, p_out_of_order: Boolean(full.outOfOrder), p_offline: offline });
  if (error && /PGRST202|could not find|function/i.test(`${error.message} ${error.code}`)) ({ error } = await supabase.rpc("crew_add_day_event", { ...base, p_device_at: full.deviceAt, p_out_of_order: Boolean(full.outOfOrder) }));
  // Older server: new tap kinds are not accepted there; old kinds go through the old signature.
  if (error && /PGRST202|could not find|function/i.test(`${error.message} ${error.code}`)) {
    const old = full.kind === "end_day" ? "end_shift" : full.kind;
    ({ error } = ["start_job", "start_transit", "arrive", "end_shift"].includes(old) ? await supabase.rpc("crew_add_day_event", { ...base, p_kind: old }) : { error });
  }
  const ok = !error;
  if (ok) writeLocal(key, readLocal<TapEvent[]>(key, []).map((e) => (e.id === full.id ? { ...e, pending: false } : e)));
  return { event: { ...full, pending: !ok }, saved: ok || missing(error) ? "ok" : error!.message, local: !ok };
}

/** Worker: his own taps (server rows + anything only on this phone). */
export async function loadMyTaps(email: string): Promise<TapEvent[]> {
  const local = readLocal<TapEvent[]>(`${KEY_EVENTS}:${email.toLowerCase()}`, []);
  const since = localDate(new Date(Date.now() - 14 * 86400000));
  const { data, error } = await selectEvents((cols) => supabase.from("crew_day_events").select(cols).gte("work_date", since).order("at"));
  if (error) return local;
  const server = ((data || []) as EventRow[]).map(fromRow);
  const ids = new Set(server.map((e) => e.id));
  return dedupeTaps([...server, ...local.filter((e) => !ids.has(e.id))]);
}

export async function requestFix(fix: Omit<FixRequest, "id" | "status" | "createdAt">, email: string) {
  const full: FixRequest = { ...fix, id: newId(), status: "pending", createdAt: new Date().toISOString() };
  const key = `${KEY_FIXES}:${email.toLowerCase()}`;
  writeLocal(key, [...readLocal<FixRequest[]>(key, []), full]);
  const { error } = await supabase.rpc("crew_request_time_fix", { p_id: full.id, p_work_date: full.date, p_kind: full.kind, p_at: full.at, p_reason: full.reason, p_event_id: full.eventId ?? null, p_doc_id: full.docId || "" });
  return { fix: full, error: error && !missing(error) ? error.message : "" };
}

type FixRow = { id: string; employee_id: string; work_date: string; event_id: string | null; kind: TapKind; at: string; doc_id: string; reason: string; status: FixRequest["status"]; created_at: string; decided_at: string | null; owner_note?: string | null };
const fixFromRow = (r: FixRow): FixRequest => ({ id: r.id, employeeId: r.employee_id, date: String(r.work_date).slice(0, 10), ...(r.event_id ? { eventId: r.event_id } : {}), kind: r.kind, at: r.at, docId: r.doc_id || undefined, reason: r.reason, status: r.status, createdAt: r.created_at, ...(r.decided_at ? { decidedAt: r.decided_at } : {}), ...(r.owner_note ? { ownerNote: r.owner_note } : {}) });

export async function loadMyFixes(email: string): Promise<FixRequest[]> {
  const local = readLocal<FixRequest[]>(`${KEY_FIXES}:${email.toLowerCase()}`, []);
  const { data, error } = await supabase.from("crew_time_fixes").select("*").order("created_at");
  if (error) return local;
  const server = ((data || []) as FixRow[]).map(fixFromRow);
  const ids = new Set(server.map((f) => f.id));
  return [...server, ...local.filter((f) => !ids.has(f.id))];
}

export type DayApproval = { employeeId: string; date: string; paidMinutes: number; driveMinutes: number; editedMinutes?: number | null; approvedAt?: string | null; changedAt?: string | null };
export type OwnerTimesheet = { events: TapEvent[]; fixes: FixRequest[]; approvals: DayApproval[]; settings: TimesheetSettings; cloud: boolean; cloudError?: string };

/** Owner: everything for the days [from, to] (YYYY-MM-DD). */
export async function loadOwnerTimesheet(from: string, to: string): Promise<OwnerTimesheet> {
  const localApprovals = readLocal<DayApproval[]>(KEY_APPROVALS, []);
  const localSettings = readTimesheetSettings(readLocal(KEY_SETTINGS, {}));
  const evQuery = () => selectEvents((cols) => supabase.from("crew_day_events").select(cols).gte("work_date", from).lte("work_date", to).order("at"));
  let [ev, fx, ap, st] = await Promise.all([
    selectEvents((cols) => supabase.from("crew_day_events").select(cols).gte("work_date", from).lte("work_date", to).order("at")),
    supabase.from("crew_time_fixes").select("*").gte("work_date", from).lte("work_date", to).order("created_at"),
    supabase.from("crew_day_approvals").select("*").gte("work_date", from).lte("work_date", to),
    supabase.from("crew_timesheet_settings").select("*").maybeSingle(),
  ]);
  // Signed out / expired session: RLS returns empty lists with no error. Never show that as "No hours";
  // fall back to this device's copy and report cloud=false so the page can say so.
  const { data: auth } = await supabase.auth.getSession();
  const signedIn = Boolean(auth.session?.user);
  // One retry for a transient failure (network blip, token refresh racing the first read) before showing the offline banner.
  if (signedIn && (ev.error || ap.error)) {
    await new Promise((r) => setTimeout(r, 1500)); // PostgREST answers 503 PGRST002 for a moment while it reloads its schema after a migration
    [ev, ap] = await Promise.all([ev.error ? evQuery() : Promise.resolve(ev), ap.error ? supabase.from("crew_day_approvals").select("*").gte("work_date", from).lte("work_date", to) : Promise.resolve(ap)]);
  }
  const errs = [ev.error && `events: ${ev.error.code || ""} ${ev.error.message || ""}`, ap.error && `approvals: ${ap.error.code || ""} ${ap.error.message || ""}`, fx.error && `fixes: ${fx.error.code || ""} ${fx.error.message || ""}`, st.error && `settings: ${st.error.code || ""} ${st.error.message || ""}`].filter(Boolean) as string[];
  if (errs.length && typeof console !== "undefined") console.warn("[timesheet] cloud read failed:", errs.join(" | "));
  const cloud = signedIn && !ev.error && !ap.error;
  const cloudError = !signedIn ? "not signed in" : errs.join(" | ");
  const cloudApprovals = !signedIn || ap.error ? [] : ((ap.data || []) as Record<string, unknown>[]).map((r) => ({ employeeId: String(r.employee_id), date: String(r.work_date).slice(0, 10), paidMinutes: Number(r.paid_minutes) || 0, driveMinutes: Number(r.drive_minutes) || 0, editedMinutes: r.edited_minutes == null ? null : Number(r.edited_minutes), approvedAt: (r.approved_at as string) || null, changedAt: (r.changed_at as string) || null }));
  const seen = new Set(cloudApprovals.map((a) => `${a.employeeId}|${a.date}`));
  const approvals = !signedIn || ap.error ? localApprovals : [...cloudApprovals, ...localApprovals.filter((a) => !seen.has(`${a.employeeId}|${a.date}`) && a.approvedAt)];
  const s = st.data as Record<string, unknown> | null;
  return {
    events: ev.error ? [] : dedupeTaps(((ev.data || []) as EventRow[]).map(fromRow)),
    fixes: fx.error ? [] : ((fx.data || []) as FixRow[]).map(fixFromRow),
    approvals: approvals.filter((a) => a.date >= from && a.date <= to),
    settings: s ? readTimesheetSettings({ ...localSettings, ...((s.rules as object) || {}), gapMinutes: s.gap_minutes, transitTimeoutMinutes: s.transit_timeout_minutes, halfDayHours: s.half_day_hours }) : localSettings,
    cloud,
    cloudError,
  };
}

export function readLocalTimesheetSettings() { return readTimesheetSettings(readLocal(KEY_SETTINGS, {})); }

export async function saveTimesheetSettings(settings: TimesheetSettings, previous?: TimesheetSettings) {
  writeLocal(KEY_SETTINGS, settings);
  const { data } = await supabase.auth.getUser();
  // Rules change pay: refresh this week and last week (older weeks are usually approved/paid and stay as they are).
  const today = ymdTz(new Date()), last = ymdTz(new Date(Date.now() - 7 * 86400000));
  if (!data.user) { await queuePayRefresh([today, last], "settings"); return; }
  const row = { owner_id: data.user.id, gap_minutes: Math.round(settings.gapMinutes), transit_timeout_minutes: Math.round(settings.transitTimeoutMinutes), half_day_hours: settings.halfDayHours, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("crew_timesheet_settings").upsert({ ...row, rules: settings });
  if (error && /rules|column|42703/i.test(`${error.message} ${error.code}`)) await supabase.from("crew_timesheet_settings").upsert(row); // older server: phone keeps the rest
  if (previous) {
    const changed = (Object.keys(settings) as (keyof TimesheetSettings)[]).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(previous[k]));
    if (changed.length) await logAudit({ action: "settings", oldValue: Object.fromEntries(changed.map((k) => [k, previous[k]])), newValue: Object.fromEntries(changed.map((k) => [k, settings[k]])) });
  }
  await queuePayRefresh([today, last], "settings");
}

// ---------- Audit log (owner only; rows are never deleted) ----------
export type AuditRow = { id?: string; at: string; actor: string; employeeId: string; date: string | null; action: string; oldValue: unknown; newValue: unknown };
const KEY_AUDIT = "clientready-time-audit";
/** Fired after every audit row is written (locally, then again once the cloud insert lands). */
const KEY_AUDIT_PENDING = "clientready-time-audit-pending";
/** Audit rows not yet saved to the cloud (shown as "N changes not synced yet"). */
export const pendingAuditCount = () => readLocal<AuditRow[]>(KEY_AUDIT_PENDING, []).length;
export const AUDIT_SAVED_EVENT = "clientready:time-audit-saved";
const auditSaved = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(AUDIT_SAVED_EVENT)); };
/** Who did it, for people: the owner's name only when the actor is the owner's own account, a worker / crew lead by
 * his email, else the email itself (or "Unknown"). "system" rows read "System". */
export function actorLabel(actor: string, workers: { name: string; email?: string }[] = [], owner: { name?: string; email?: string } = {}) {
  const a = (actor || "").trim().toLowerCase();
  if (a === "system") return "System";
  if (a === "owner" || (a && a === (owner.email || "").trim().toLowerCase())) return owner.name || "Owner";
  const w = a ? workers.find((x) => (x.email || "").trim().toLowerCase() === a) : undefined;
  if (w?.name) return w.name;
  return actor ? actor.trim() : "Unknown";
}
/** Owner: write one audit row (taps are logged by the database trigger). */
export async function logAudit(row: { action: string; employeeId?: string; date?: string | null; oldValue?: unknown; newValue?: unknown }) {
  // Session from local storage (no network), so this device's copy is written right away, even offline.
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const data = { user: sess.session?.user || null };
  const full: AuditRow = { at: new Date().toISOString(), actor: data.user?.email || "owner", employeeId: row.employeeId || "", date: row.date ?? null, action: row.action, oldValue: row.oldValue ?? null, newValue: row.newValue ?? null };
  writeLocal(KEY_AUDIT, [...readLocal<AuditRow[]>(KEY_AUDIT, []), full].slice(-2000));
  if (!data.user) { auditSaved(); return; }
  const userId = data.user.id;
  // Failed cloud inserts stay in a pending queue and are retried with the next audit write (never dropped silently).
  const queue = [...readLocal<AuditRow[]>(KEY_AUDIT_PENDING, []), full];
  const failed: AuditRow[] = [];
  let lastError = "";
  for (const r of queue) {
    const { error } = await supabase.from("crew_time_audit").insert({ owner_id: userId, actor_email: r.actor, employee_id: r.employeeId, work_date: r.date, action: r.action, old_value: r.oldValue, new_value: r.newValue }).then((x) => x, (e) => ({ error: { message: String(e) } }));
    if (error) { failed.push(r); lastError = error.message; }
  }
  writeLocal(KEY_AUDIT_PENDING, failed.slice(-500));
  auditSaved();
  return lastError ? { error: lastError, pending: failed.length } : undefined;
}
/** Owner: audit rows (newest first), optionally for one worker/day. Falls back to this device's copy. */
export async function loadAudit(filter: { employeeId?: string; date?: string; limit?: number } = {}): Promise<AuditRow[]> {
  let q = supabase.from("crew_time_audit").select("id,at,actor_email,employee_id,work_date,action,old_value,new_value").order("at", { ascending: false }).limit(filter.limit || 500);
  if (filter.employeeId) q = q.eq("employee_id", filter.employeeId);
  if (filter.date) q = q.eq("work_date", filter.date);
  const { data, error } = await q;
  const local = readLocal<AuditRow[]>(KEY_AUDIT, []).filter((r) => (!filter.employeeId || r.employeeId === filter.employeeId) && (!filter.date || r.date === filter.date)).reverse();
  if (error) return local;
  return ((data || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), at: String(r.at), actor: String(r.actor_email || ""), employeeId: String(r.employee_id || ""), date: r.work_date ? String(r.work_date).slice(0, 10) : null, action: String(r.action), oldValue: r.old_value, newValue: r.new_value }));
}
/** CSV of audit rows (for the 3-year record keeping export). */
export function auditCsv(rows: AuditRow[]) {
  const q = (v: unknown) => `"${String(typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)).replace(/"/g, '""')}"`;
  return ["When,Who,Worker,Day,Action,Old,New", ...rows.map((r) => [r.at, r.actor, r.employeeId, r.date || "", r.action, r.oldValue, r.newValue].map(q).join(","))].join("\n");
}

// ---------- Weekly attestation ("I confirm these hours are correct") ----------
export async function attestWeek(week: string, minutes: number, email: string) {
  const key = `clientready-attest:${email.toLowerCase()}`;
  const at = new Date().toISOString();
  writeLocal(key, { ...readLocal<Record<string, string>>(key, {}), [week]: at });
  const { error } = await supabase.rpc("crew_attest_week", { p_week: week, p_minutes: Math.round(minutes) });
  return error && !missing(error) ? error.message : "";
}
export function readMyAttestations(email: string) { return readLocal<Record<string, string>>(`clientready-attest:${email.toLowerCase()}`, {}); }
export async function loadAttestations(week: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("crew_week_attestations").select("employee_id,attested_at").eq("week_start", week);
  if (error) return {};
  return Object.fromEntries(((data || []) as { employee_id: string; attested_at: string }[]).map((r) => [r.employee_id, r.attested_at]));
}

/** Owner: save (or clear with approvedAt null) day approvals. Hours only, never money. */
/** Save day approvals; returns "" or the server error (the caller shows it, the day is not shown approved). */
export async function saveApprovals(rows: DayApproval[], note = ""): Promise<string> {
  const all = readLocal<DayApproval[]>(KEY_APPROVALS, []);
  const keyOf = (a: DayApproval) => `${a.employeeId}|${a.date}`;
  const next = new Map(all.map((a) => [keyOf(a), a]));
  const before = new Map(all.map((a) => [keyOf(a), a]));
  rows = rows.map((r) => (r.approvedAt ? { ...r, changedAt: null } : r));
  for (const row of rows) next.set(keyOf(row), row);
  writeLocal(KEY_APPROVALS, [...next.values()]);
  for (const row of rows) {
    const old = before.get(keyOf(row));
    // An hours change is always logged as an edit (also when it reopens an approved day).
    const edited = row.editedMinutes != null && row.editedMinutes !== (old?.editedMinutes ?? null);
    const action = edited ? (row.approvedAt ? "edit_approve" : "edit") : row.approvedAt ? (old?.approvedAt ? "" : "approve") : old?.approvedAt ? "unapprove" : "";
    if (action) void logAudit({ action, employeeId: row.employeeId, date: row.date, oldValue: old ? { paidMinutes: old.paidMinutes, editedMinutes: old.editedMinutes ?? null, approved: Boolean(old.approvedAt) } : null, newValue: { paidMinutes: row.paidMinutes, editedMinutes: row.editedMinutes ?? null, approved: Boolean(row.approvedAt), ...(note ? { note } : {}) } });
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) { await queuePayRefresh(rows.map((r) => r.date), "approvals"); return ""; }
  const uid = data.user.id;
  const { error } = await supabase.from("crew_day_approvals").upsert(rows.map((r) => ({ owner_id: uid, employee_id: r.employeeId, work_date: r.date, paid_minutes: r.paidMinutes, drive_minutes: r.driveMinutes, edited_minutes: r.editedMinutes ?? null, approved_at: r.approvedAt ?? null, changed_at: r.changedAt ?? null, updated_at: new Date().toISOString() })));
  await queuePayRefresh(rows.map((r) => r.date), "approvals");
  return error && !missing(error) ? error.message : "";
}

export async function decideFix(id: string, status: "approved" | "denied", note = "", fix?: FixRequest) {
  const patch = { status, decided_at: new Date().toISOString() };
  let { error } = await supabase.from("crew_time_fixes").update(note ? { ...patch, owner_note: note.slice(0, 300) } : patch).eq("id", id);
  if (error && note && /owner_note|column|42703/i.test(`${error.message} ${error.code}`)) ({ error } = await supabase.from("crew_time_fixes").update(patch).eq("id", id));
  void logAudit({ action: `fix_${status}`, employeeId: fix?.employeeId, date: fix?.date ?? null, oldValue: fix ? { kind: fix.kind, status: fix.status } : null, newValue: { kind: fix?.kind, at: fix?.at, status, note } });
  return error && !missing(error) ? error.message : "";
}

/** Directions link to the next job: Apple Maps on iPhone/iPad, Google Maps elsewhere. */
export function directionsUrl(address: string) {
  const q = encodeURIComponent(address);
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
  return apple ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
}

/** Re-send taps that were saved only on this phone (offline). The server keeps an owner edit: a late tap on an
 * approved day is flagged "changed since approved" for the owner instead of overwriting the approved hours. */
let syncing: Promise<{ sent: number; left: number }> | null = null;
export function syncPendingTaps(email: string) {
  // One sync at a time (mount + "online" can fire together); each tap keeps its client id, so the server keeps one copy.
  if (!syncing) syncing = syncPendingTapsOnce(email).finally(() => { syncing = null; });
  return syncing;
}
async function syncPendingTapsOnce(email: string) {
  const key = `${KEY_EVENTS}:${email.toLowerCase()}`;
  const pending = readLocal<TapEvent[]>(key, []).filter((e) => e.pending);
  let sent = 0;
  for (const e of pending) { const r = await recordTap(e, email); if (!r.local) sent++; }
  return { sent, left: pending.length - sent };
}

/** Worker: the account's time rules (no prices in them), so the phone shows the same breaks/rounding as the owner. */
export async function loadMyTimeRules(): Promise<TimesheetSettings> {
  const { data, error } = await supabase.rpc("crew_time_rules");
  return readTimesheetSettings(error || !data ? {} : data);
}

/** Worker: their own overrides (break preset, geofence opt-out, hire date) from crew_time_rules().worker. */
export async function loadMyTimeOverrides(): Promise<WorkerTimeOverrides> {
  const { data, error } = await supabase.rpc("crew_time_rules");
  const w = (!error && data && typeof data === "object" ? (data as Record<string, unknown>).worker : undefined) as Record<string, unknown> | undefined;
  return readWorkerOverrides({ hireDate: w?.hireDate, timeOverrides: w || {} });
}

/** Queue the pay refresh (lazy import: timesheet-sync imports this file). */
// Awaited so the refresh is queued before the save resolves: a caller that then calls refreshTimesheetPay replaces it.
async function queuePayRefresh(dates: string[], source: "approvals" | "settings") {
  if (typeof window === "undefined") return;
  try { (await import("@/lib/timesheet-sync")).queueTimesheetRefresh(dates, source); } catch { /* pay refresh is best effort */ }
}
