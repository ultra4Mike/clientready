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
  window.localStorage.setItem(OWNER_CACHE, JSON.stringify(data));
  return data as Unavailable[];
}

/** employee id → note for people unavailable on `day`. */
export function unavailableOn(rows: Unavailable[], day: string) {
  const out = new Map<string, string>();
  for (const row of rows) if (row.day === day) out.set(row.employee_id, row.note || "");
  return out;
}
