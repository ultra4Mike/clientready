import { supabase } from "@/lib/supabase";

export type Unavailable = { owner_id?: string; employee_id: string; worker_email?: string; day: string; note?: string };

const OWNER_CACHE = "clientready-unavailable";

/** Crew: their own days off (RLS returns only rows for their email). One row per day. */
export async function crewMyUnavailable(): Promise<Unavailable[]> {
  const { data, error } = await supabase.from("crew_unavailable").select("day, note, employee_id").gte("day", new Date(Date.now() - 86400000).toISOString().slice(0, 10)).order("day");
  if (error || !data) return [];
  const seen = new Set<string>();
  return (data as Unavailable[]).filter((row) => (seen.has(row.day) ? false : (seen.add(row.day), true)));
}

export async function crewSetUnavailable(day: string, note: string) {
  const { error } = await supabase.rpc("crew_set_unavailable", { p_day: day, p_note: note });
  return error ? error.message : "";
}

export async function crewClearUnavailable(day: string) {
  const { error } = await supabase.rpc("crew_clear_unavailable", { p_day: day });
  return error ? error.message : "";
}

export function readOwnerUnavailable(): Unavailable[] {
  try {
    return JSON.parse(window.localStorage.getItem(OWNER_CACHE) || "[]") || [];
  } catch {
    return [];
  }
}

/** Owner: days off for their people (cached so scheduling works offline). */
export async function refreshOwnerUnavailable(): Promise<Unavailable[]> {
  const { data, error } = await supabase.from("crew_unavailable").select("employee_id, day, note");
  if (error || !data) return readOwnerUnavailable();
  // QA3c: approved time-off requests are days they can't work too (needs deploy34; skipped when missing).
  const off = await supabase.from("crew_time_off").select("employee_id, start_date, end_date, note, status").eq("status", "approved").then((r) => (r.error ? [] : r.data || []), () => []);
  const rows = mergeUnavailable(data as Unavailable[], off as TimeOffRange[]);
  window.localStorage.setItem(OWNER_CACHE, JSON.stringify(rows));
  return rows;
}

export type TimeOffRange = { employee_id: string; start_date: string; end_date: string; note?: string };
const nextDay = (d: string) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
/** Day rows plus each day of approved time-off ranges, one row per worker per day. */
export function mergeUnavailable(days: Unavailable[], ranges: TimeOffRange[] = []): Unavailable[] {
  const out = new Map<string, Unavailable>();
  for (const row of days) out.set(`${row.employee_id}|${row.day}`, row);
  for (const r of ranges) {
    if (!r.employee_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.start_date))) continue;
    const end = String(r.end_date || r.start_date).slice(0, 10);
    for (let d = String(r.start_date).slice(0, 10), n = 0; d <= end && n < 62; d = nextDay(d), n++) {
      const k = `${r.employee_id}|${d}`;
      if (!out.has(k)) out.set(k, { employee_id: r.employee_id, day: d, note: r.note ? `Time off: ${r.note}` : "Time off" });
    }
  }
  return [...out.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Names of the given workers who can't work on `day` ("" when everyone can). */
export function unavailableWarning(rows: Unavailable[], day: string, workerIds: string[], names: Map<string, string>) {
  const off = unavailableOn(rows, day);
  const who = workerIds.filter((id) => off.has(id)).map((id) => `${names.get(id) || "Worker"}${off.get(id) ? ` (${off.get(id)})` : ""}`);
  return who.length ? `Marked can't work on ${day}: ${who.join(", ")}.` : "";
}

/** employee id → note for people unavailable on `day`. */
export function unavailableOn(rows: Unavailable[], day: string) {
  const out = new Map<string, string>();
  for (const row of rows) if (row.day === day) out.set(row.employee_id, row.note || "");
  return out;
}
