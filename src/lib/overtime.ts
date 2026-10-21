import { readSchedule } from "@/lib/schedule";
import { periodRange } from "@/lib/period";

/**
 * Overtime soft warning (owner only). One number in Profile: weekly hours per worker (default 40; 0 = off).
 * Weeks run Monday to Sunday. Never blocks a save and never changes pay; it only warns.
 */
export function readOvertimeHours(raw: unknown) {
  const text = String(raw ?? "").trim();
  const value = Number(text);
  return text === "" || !Number.isFinite(value) ? 40 : Math.min(168, Math.max(0, value));
}

export function ownerOvertimeHours() {
  if (typeof window === "undefined") return 40;
  try { return readOvertimeHours(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}")?.overtimeHours); } catch { return 40; }
}

const toMin = (time: string) => { const [h, m] = String(time || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Hours a job's schedule takes (end - start; a start with no end counts 1 hour). */
export function scheduledHours(schedule: { startTime?: string; endTime?: string } | null) {
  if (!schedule?.startTime) return 0;
  const minutes = schedule.endTime && schedule.endTime > schedule.startTime ? toMin(schedule.endTime) - toMin(schedule.startTime) : 60;
  return minutes / 60;
}

type Doc = { id: string; data?: Record<string, unknown> };

/** Scheduled hours per worker in the Mon-Sun week of `date`, counting `mine` in place of this job's saved schedule. */
export function weekScheduledHours(docs: Doc[], docId: string, mine: { date: string; startTime?: string; endTime?: string; workerIds: string[] }) {
  const week = periodRange("week", new Date(`${mine.date}T12:00:00`));
  const hours: Record<string, number> = {};
  const add = (ids: string[], h: number) => ids.forEach((id) => { hours[id] = (hours[id] || 0) + h; });
  for (const doc of docs) {
    if (doc.id === docId) continue;
    const schedule = readSchedule(doc.data);
    if (!schedule || schedule.date < week.from || schedule.date > week.to) continue;
    add(schedule.workerIds || [], scheduledHours(schedule));
  }
  add(mine.workerIds, scheduledHours(mine));
  return hours;
}

/** Workers over the limit: [{ id, hours }]. Empty when the limit is 0 (off). */
export function overLimit(hours: Record<string, number>, limit: number) {
  if (!(limit > 0)) return [];
  return Object.entries(hours).filter(([, h]) => h > limit + 0.001).map(([id, h]) => ({ id, hours: Math.round(h * 100) / 100 }));
}
