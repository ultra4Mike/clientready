/**
 * Storage for the day timesheet: tap events, fix requests, day approvals, settings.
 * Supabase first (migration 20261026110000_crew_timesheets); when the tables/functions are not there yet,
 * everything keeps working on this device's localStorage. A worker only ever writes his own taps.
 */
import { supabase } from "@/lib/supabase";
import { readTimesheetSettings, type FixRequest, type TapEvent, type TapKind, type TimesheetSettings } from "@/lib/timesheet";

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

export const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

type EventRow = { id: string; employee_id: string; work_date: string; kind: TapKind; at: string; doc_id: string; lat: number | null; lng: number | null; not_at_site: boolean };
const fromRow = (row: EventRow): TapEvent => ({ id: row.id, employeeId: row.employee_id, date: String(row.work_date).slice(0, 10), kind: row.kind, at: row.at, docId: row.doc_id || undefined, ...(row.lat != null ? { lat: row.lat } : {}), ...(row.lng != null ? { lng: row.lng } : {}), notAtSite: Boolean(row.not_at_site) });

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

/** Worker: record a tap. Saved on the phone first, then sent (an older server keeps the phone copy). */
export async function recordTap(event: Omit<TapEvent, "id"> & { id?: string }, email: string) {
  const full: TapEvent = { ...event, id: event.id || newId() };
  const key = `${KEY_EVENTS}:${email.toLowerCase()}`;
  writeLocal(key, [...readLocal<TapEvent[]>(key, []).filter((e) => e.id !== full.id), full]);
  const { error } = await supabase.rpc("crew_add_day_event", {
    p_id: full.id, p_kind: full.kind, p_at: full.at, p_work_date: full.date, p_doc_id: full.docId || "",
    p_lat: full.lat ?? null, p_lng: full.lng ?? null, p_not_at_site: Boolean(full.notAtSite),
  });
  return { event: full, saved: !error || missing(error) ? "ok" : error.message, local: missing(error) };
}

/** Worker: his own taps (server rows + anything only on this phone). */
export async function loadMyTaps(email: string): Promise<TapEvent[]> {
  const local = readLocal<TapEvent[]>(`${KEY_EVENTS}:${email.toLowerCase()}`, []);
  const since = localDate(new Date(Date.now() - 14 * 86400000));
  const { data, error } = await supabase.from("crew_day_events").select("id,employee_id,work_date,kind,at,doc_id,lat,lng,not_at_site").gte("work_date", since).order("at");
  if (error) return local;
  const server = ((data || []) as EventRow[]).map(fromRow);
  const ids = new Set(server.map((e) => e.id));
  return [...server, ...local.filter((e) => !ids.has(e.id))];
}

export async function requestFix(fix: Omit<FixRequest, "id" | "status" | "createdAt">, email: string) {
  const full: FixRequest = { ...fix, id: newId(), status: "pending", createdAt: new Date().toISOString() };
  const key = `${KEY_FIXES}:${email.toLowerCase()}`;
  writeLocal(key, [...readLocal<FixRequest[]>(key, []), full]);
  const { error } = await supabase.rpc("crew_request_time_fix", { p_id: full.id, p_work_date: full.date, p_kind: full.kind, p_at: full.at, p_reason: full.reason, p_event_id: full.eventId ?? null, p_doc_id: full.docId || "" });
  return { fix: full, error: error && !missing(error) ? error.message : "" };
}

type FixRow = { id: string; employee_id: string; work_date: string; event_id: string | null; kind: TapKind; at: string; doc_id: string; reason: string; status: FixRequest["status"]; created_at: string; decided_at: string | null };
const fixFromRow = (r: FixRow): FixRequest => ({ id: r.id, employeeId: r.employee_id, date: String(r.work_date).slice(0, 10), ...(r.event_id ? { eventId: r.event_id } : {}), kind: r.kind, at: r.at, docId: r.doc_id || undefined, reason: r.reason, status: r.status, createdAt: r.created_at, ...(r.decided_at ? { decidedAt: r.decided_at } : {}) });

export async function loadMyFixes(email: string): Promise<FixRequest[]> {
  const local = readLocal<FixRequest[]>(`${KEY_FIXES}:${email.toLowerCase()}`, []);
  const { data, error } = await supabase.from("crew_time_fixes").select("*").order("created_at");
  if (error) return local;
  const server = ((data || []) as FixRow[]).map(fixFromRow);
  const ids = new Set(server.map((f) => f.id));
  return [...server, ...local.filter((f) => !ids.has(f.id))];
}

export type DayApproval = { employeeId: string; date: string; paidMinutes: number; driveMinutes: number; editedMinutes?: number | null; approvedAt?: string | null };
export type OwnerTimesheet = { events: TapEvent[]; fixes: FixRequest[]; approvals: DayApproval[]; settings: TimesheetSettings; cloud: boolean };

/** Owner: everything for the days [from, to] (YYYY-MM-DD). */
export async function loadOwnerTimesheet(from: string, to: string): Promise<OwnerTimesheet> {
  const localApprovals = readLocal<DayApproval[]>(KEY_APPROVALS, []);
  const localSettings = readTimesheetSettings(readLocal(KEY_SETTINGS, {}));
  const [ev, fx, ap, st] = await Promise.all([
    supabase.from("crew_day_events").select("id,employee_id,work_date,kind,at,doc_id,lat,lng,not_at_site").gte("work_date", from).lte("work_date", to).order("at"),
    supabase.from("crew_time_fixes").select("*").gte("work_date", from).lte("work_date", to).order("created_at"),
    supabase.from("crew_day_approvals").select("*").gte("work_date", from).lte("work_date", to),
    supabase.from("crew_timesheet_settings").select("*").maybeSingle(),
  ]);
  const cloud = !ev.error;
  const approvals = ap.error ? localApprovals : ((ap.data || []) as Record<string, unknown>[]).map((r) => ({ employeeId: String(r.employee_id), date: String(r.work_date).slice(0, 10), paidMinutes: Number(r.paid_minutes) || 0, driveMinutes: Number(r.drive_minutes) || 0, editedMinutes: r.edited_minutes == null ? null : Number(r.edited_minutes), approvedAt: (r.approved_at as string) || null }));
  const s = st.data as Record<string, unknown> | null;
  return {
    events: ev.error ? [] : ((ev.data || []) as EventRow[]).map(fromRow),
    fixes: fx.error ? [] : ((fx.data || []) as FixRow[]).map(fixFromRow),
    approvals: approvals.filter((a) => a.date >= from && a.date <= to),
    settings: s ? readTimesheetSettings({ gapMinutes: s.gap_minutes, transitTimeoutMinutes: s.transit_timeout_minutes, halfDayHours: s.half_day_hours }) : localSettings,
    cloud,
  };
}

export function readLocalTimesheetSettings() { return readTimesheetSettings(readLocal(KEY_SETTINGS, {})); }

export async function saveTimesheetSettings(settings: TimesheetSettings) {
  writeLocal(KEY_SETTINGS, settings);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("crew_timesheet_settings").upsert({ owner_id: data.user.id, gap_minutes: Math.round(settings.gapMinutes), transit_timeout_minutes: Math.round(settings.transitTimeoutMinutes), half_day_hours: settings.halfDayHours, updated_at: new Date().toISOString() });
}

/** Owner: save (or clear with approvedAt null) day approvals. Hours only, never money. */
export async function saveApprovals(rows: DayApproval[]) {
  const all = readLocal<DayApproval[]>(KEY_APPROVALS, []);
  const keyOf = (a: DayApproval) => `${a.employeeId}|${a.date}`;
  const next = new Map(all.map((a) => [keyOf(a), a]));
  for (const row of rows) next.set(keyOf(row), row);
  writeLocal(KEY_APPROVALS, [...next.values()]);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const uid = data.user.id;
  await supabase.from("crew_day_approvals").upsert(rows.map((r) => ({ owner_id: uid, employee_id: r.employeeId, work_date: r.date, paid_minutes: r.paidMinutes, drive_minutes: r.driveMinutes, edited_minutes: r.editedMinutes ?? null, approved_at: r.approvedAt ?? null, updated_at: new Date().toISOString() })));
}

export async function decideFix(id: string, status: "approved" | "denied") {
  const { error } = await supabase.from("crew_time_fixes").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
  return error && !missing(error) ? error.message : "";
}

/** Directions link to the next job: Apple Maps on iPhone/iPad, Google Maps elsewhere. */
export function directionsUrl(address: string) {
  const q = encodeURIComponent(address);
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
  return apple ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
}
