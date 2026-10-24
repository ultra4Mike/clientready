/** Unpaid time-off requests (crew asks, owner approves/denies). Needs migration 20261024130000; works without PTO setup. */
import { supabase } from "@/lib/supabase";
import type { TimeOffRequest, TimeOffStatus } from "@/lib/crew-tools";

const missing = (message: string) => /crew_time_off|crew_request_time_off|crew_my_time_off|PGRST202|PGRST205|could not find|does not exist/i.test(message);
const NOT_READY = "Time off requests need the latest database update. Ask your boss.";

export async function crewMyTimeOff(): Promise<{ rows: TimeOffRequest[]; error: string }> {
  const { data, error } = await supabase.rpc("crew_my_time_off");
  if (error) return { rows: [], error: missing(error.message) ? NOT_READY : error.message };
  return { rows: (Array.isArray(data) ? data : []) as TimeOffRequest[], error: "" };
}

export async function crewRequestTimeOff(start: string, end: string, note: string): Promise<string> {
  const { error } = await supabase.rpc("crew_request_time_off", { p_start: start, p_end: end || start, p_note: note });
  return error ? (missing(error.message) ? NOT_READY : error.message) : "";
}

export async function ownerTimeOff(): Promise<{ rows: TimeOffRequest[]; error: string }> {
  const { data, error } = await supabase.from("crew_time_off").select("id, worker_email, worker_name, start_date, end_date, note, status, created_at, decided_at").order("created_at", { ascending: false }).limit(100);
  if (error) return { rows: [], error: missing(error.message) ? "Time off requests need the latest database update (deploy34.sql)." : error.message };
  return { rows: (data || []) as TimeOffRequest[], error: "" };
}

export async function decideTimeOff(id: string, status: Exclude<TimeOffStatus, "pending">): Promise<string> {
  const { error } = await supabase.from("crew_time_off").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : "";
}
