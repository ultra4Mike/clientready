// Phase 2 data: PTO/sick requests + balances, crew lead team. localStorage first (owner), Supabase when signed in.
import { supabase } from "@/lib/supabase";
import { ymdTz, type TapKind } from "@/lib/timesheet";
import type { PtoKind, PtoRequest } from "@/lib/pay-phase2";

const KEY_PTO = "clientready-pto-requests";
const readLocal = (): PtoRequest[] => { try { return JSON.parse(window.localStorage.getItem(KEY_PTO) || "[]"); } catch { return []; } };
const writeLocal = (v: PtoRequest[]) => { try { window.localStorage.setItem(KEY_PTO, JSON.stringify(v)); } catch { /* full */ } };
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
type Row = { id: string; employee_id: string; work_date: string; hours: number | string; kind: PtoKind; note: string | null; status: PtoRequest["status"]; created_at: string; decided_at: string | null };
const fromRow = (r: Row): PtoRequest => ({ id: r.id, employeeId: r.employee_id, date: String(r.work_date).slice(0, 10), hours: Number(r.hours) || 0, kind: r.kind, note: r.note || "", status: r.status, createdAt: r.created_at, decidedAt: r.decided_at });

/** Owner: all requests for a year (cloud wins; this device's copy when signed out / table missing). */
export async function loadPtoRequests(year: string): Promise<PtoRequest[]> {
  const local = readLocal().filter((r) => r.date.startsWith(year));
  const { data: s } = await supabase.auth.getSession();
  if (!s.session?.user) return local;
  const { data, error } = await supabase.from("crew_pto_requests").select("*").gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`).order("work_date");
  if (error) return local;
  const cloud = ((data || []) as Row[]).map(fromRow);
  writeLocal([...readLocal().filter((r) => !r.date.startsWith(year)), ...cloud]);
  return cloud;
}

/** Owner: approve / deny (or add one for a worker). Returns "" or the error. */
export async function savePtoRequest(req: PtoRequest): Promise<string> {
  writeLocal([...readLocal().filter((r) => r.id !== req.id), req]);
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user; if (!user) return "";
  const { error } = await supabase.from("crew_pto_requests").upsert({ id: req.id, owner_id: user.id, employee_id: req.employeeId, work_date: req.date, hours: req.hours, kind: req.kind, note: req.note || "", status: req.status, decided_at: req.decidedAt || null });
  return error ? error.message : "";
}
export const newPtoRequest = (p: Omit<PtoRequest, "id" | "createdAt" | "status"> & { status?: PtoRequest["status"] }): PtoRequest => ({ id: newId(), createdAt: new Date().toISOString(), status: "pending", ...p });

/** Owner: publish computed balances (hours only) so each worker can read his own. */
export async function savePtoBalances(year: string, rows: { employeeId: string; accrued: number; taken: number; available: number }[]) {
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user; if (!user || !rows.length) return;
  await supabase.from("crew_pto_balances").upsert(rows.map((r) => ({ owner_id: user.id, employee_id: r.employeeId, year: Number(year), accrued: r.accrued, taken: r.taken, available: r.available, updated_at: new Date().toISOString() })));
}

// ---------- Crew side ----------
export async function loadMyPto(year: string) {
  const [req, bal] = await Promise.all([
    supabase.from("crew_pto_requests").select("*").gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`).order("work_date"),
    supabase.rpc("crew_pto_balance", { p_year: Number(year) }),
  ]);
  const b = Array.isArray(bal.data) ? (bal.data[0] as { accrued: number; taken: number; available: number } | undefined) : undefined;
  return { requests: req.error ? [] : ((req.data || []) as Row[]).map(fromRow), balance: b ? { accrued: Number(b.accrued), taken: Number(b.taken), available: Number(b.available) } : null };
}
export async function requestMyPto(p: { date: string; hours: number; kind: PtoKind; note: string }): Promise<string> {
  const { error } = await supabase.rpc("crew_request_pto", { p_id: newId(), p_work_date: p.date, p_hours: p.hours, p_kind: p.kind, p_note: p.note });
  return error ? error.message : "";
}

export type LeadSelf = { employeeId: string; crewIds: string[]; seeHours: boolean; clockTeam: boolean };
export async function loadLeadSelf(): Promise<LeadSelf | null> {
  const { data, error } = await supabase.rpc("crew_lead_self");
  const r = !error && Array.isArray(data) ? (data[0] as { employee_id: string; crew_ids: string[]; see_hours: boolean; clock_team: boolean } | undefined) : undefined;
  return r ? { employeeId: r.employee_id, crewIds: r.crew_ids || [], seeHours: r.see_hours, clockTeam: r.clock_team } : null;
}
export async function loadLeadTeam(date: string) {
  const [team, ev] = await Promise.all([supabase.rpc("crew_lead_team"), supabase.rpc("crew_lead_events", { p_from: date, p_to: date })]);
  const people = !team.error && Array.isArray(team.data) ? (team.data as { employee_id: string; name: string }[]) : [];
  const events = !ev.error && Array.isArray(ev.data) ? (ev.data as { id: string; employee_id: string; kind: TapKind; at: string; acted_by: string | null }[]) : [];
  return { people, events };
}
/** Lead clocks a crew member in/out; acted_by is recorded by the server. */
export async function leadTap(employeeId: string, kind: "start_day" | "end_day" | "break_start" | "break_end"): Promise<string> {
  const at = new Date();
  const { error } = await supabase.rpc("crew_lead_tap", { p_id: newId(), p_employee_id: employeeId, p_kind: kind, p_at: at.toISOString(), p_work_date: ymdTz(at) });
  return error ? error.message : "";
}

/** Owner: approved hours worked per worker in a calendar year (drives PTO accrual). Empty map offline. */
export async function loadYearWorkedHours(year: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data } = await supabase.from("crew_day_approvals").select("employee_id, paid_minutes, edited_minutes, approved_at").gte("work_date", `${year}-01-01`).lte("work_date", `${year}-12-31`);
  for (const r of (data || []) as { employee_id: string; paid_minutes: number; edited_minutes: number | null; approved_at: string | null }[]) {
    if (!r.approved_at) continue;
    out.set(r.employee_id, (out.get(r.employee_id) || 0) + (r.edited_minutes ?? r.paid_minutes ?? 0) / 60);
  }
  return out;
}
