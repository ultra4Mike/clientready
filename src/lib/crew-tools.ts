/**
 * Crew app helpers (QA3b): job details without prices, status labels, Done-blocked reasons,
 * unpaid time-off requests and blank-safe pay rates. Pure functions so they can be unit tested.
 */

/** Drops money amounts from a line description (crew never see prices). */
export function stripPrices(text: unknown): string {
  return String(text ?? "")
    .replace(/(?:[$€£]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|dollars?))/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** The job's title and its line descriptions (scope of work) for crew_jobs: names only, never qty/rate/amounts. */
export function crewJobDetails(doc: { title?: unknown; data?: Record<string, unknown> | null }): { job_title: string; line_names: string[] } {
  const data = doc.data || {};
  const title = stripPrices(data.title || doc.title || "").slice(0, 200);
  const items = Array.isArray(data.items) ? (data.items as { description?: unknown }[]) : [];
  const lines = items.map((item) => stripPrices(item?.description).slice(0, 200)).filter(Boolean).slice(0, 30);
  return { job_title: title, line_names: lines };
}

export type CrewStatus = "scheduled" | "in_progress" | "done";
const LABEL: Record<CrewStatus, string> = { scheduled: "Scheduled", in_progress: "In progress", done: "Done" };

/** One wording everywhere on the crew app (cards, detail, recent list). */
export function crewStatusLabel(status: unknown, confirmed?: boolean): string {
  const key = (status === "done" || status === "in_progress" ? status : "scheduled") as CrewStatus;
  if (key === "done") return confirmed ? "Done · confirmed" : "Done · awaiting confirmation";
  return LABEL[key];
}

/** Pay-row cards (another day of the same job) take the job's real status from its schedule row. */
export function inheritJobStatus<T extends { doc_id: string; scheduled: boolean; schedule_status?: string; done_confirmed?: boolean }>(cards: T[]): T[] {
  const bySched = new Map<string, T>();
  for (const card of cards) if (card.scheduled && !bySched.has(card.doc_id)) bySched.set(card.doc_id, card);
  return cards.map((card) => {
    const sched = bySched.get(card.doc_id);
    if (card.scheduled || !sched || card.schedule_status) return card;
    return { ...card, schedule_status: sched.schedule_status, done_confirmed: sched.done_confirmed };
  });
}

/** Why "Mark done" is blocked ("" = ready). Photo is required unless the owner made it optional. */
export function doneBlockedReason(opts: { photos: number; photoOptional?: boolean; checklistLeft?: number }): string {
  const reasons: string[] = [];
  if (!opts.photoOptional && opts.photos < 1) reasons.push("A photo of the finished job is required");
  if ((opts.checklistLeft || 0) > 0) reasons.push(`Tick every checklist item first (${opts.checklistLeft} left)`);
  return reasons.length ? `${reasons.join(". ")}.` : "";
}

/** Owner setting (device + synced to crew rows): finished-job photo optional. Default false = required (current behaviour). */
export const DONE_PHOTO_OPTIONAL_KEY = "clientready-done-photo-optional";
export function readDonePhotoOptional(): boolean {
  try { return typeof window !== "undefined" && window.localStorage.getItem(DONE_PHOTO_OPTIONAL_KEY) === "1"; } catch { return false; }
}
export function writeDonePhotoOptional(on: boolean) {
  try { window.localStorage.setItem(DONE_PHOTO_OPTIONAL_KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/** Blank / salary / per-job rates are allowed. Returns a number for real hourly rates, otherwise null (never NaN). */
export function hourlyRateOrNull(rate: unknown): number | null {
  const text = String(rate ?? "").replace(/[$,\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Hours x rate that never breaks: blank or invalid rate = 0 (pay entered per job/salary is kept as is elsewhere). */
export const safeHourlyPay = (hours: unknown, rate: unknown) => {
  const r = hourlyRateOrNull(rate); const h = Number(hours);
  return r === null || !Number.isFinite(h) ? 0 : Math.round(h * r * 100) / 100;
};
export type PayType = "hourly" | "salary" | "per_job";
export const PAY_TYPE_LABEL: Record<PayType, string> = { hourly: "Hourly", salary: "Salary", per_job: "Per job" };

// ---------- Unpaid time off (works without any PTO setup) ----------
export type TimeOffStatus = "pending" | "approved" | "denied";
export type TimeOffRequest = { id: string; worker_email: string; worker_name: string; start_date: string; end_date: string; note: string; status: TimeOffStatus; created_at?: string; decided_at?: string | null };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** "" when the request is valid. */
export function timeOffError(form: { start: string; end: string; note?: string }, today = ""): string {
  if (!YMD.test(form.start || "")) return "Pick the first day off.";
  const end = form.end || form.start;
  if (!YMD.test(end)) return "Pick the last day off.";
  if (end < form.start) return "The last day can't be before the first day.";
  if (today && form.start < today) return "Time off can't start in the past.";
  if ((form.note || "").length > 500) return "Keep the note under 500 characters.";
  return "";
}
export function timeOffDays(start: string, end: string): number {
  const a = Date.parse(`${start}T12:00:00Z`); const b = Date.parse(`${(end || start)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
export const TIME_OFF_LABEL: Record<TimeOffStatus, string> = { pending: "Waiting for your boss", approved: "Approved (unpaid)", denied: "Denied" };
