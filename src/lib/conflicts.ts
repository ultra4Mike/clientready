import { derivedWhen } from "./job-when";
// Double-booking rules. The same person on two jobs whose times overlap is blocked unless the owner taps
// "Book anyway" (recorded on the job as schedule.overrides). Different people may overlap freely.
// Jobs without a start time ("Any time") and done jobs are never compared. A job with no end time counts as 1 hour.
export type Override = { workerId: string; otherDocId: string; at: string };
export type Block = { docId: string; title: string; workerId: string; start: number; end: number; date: string };
export type Conflict = Block & { mine: { start: number; end: number } };
type Sched = { date?: string; startTime?: string; endTime?: string; workerIds?: string[]; status?: string; overrides?: unknown };
type Doc = { id: string; title?: string; data?: Record<string, unknown> };

/** A job with a start but no end counts as this long everywhere (R112). */
export const DEFAULT_JOB_MINUTES = 60;
const mins = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const clockText = (total: number) => {
  const h = Math.floor(total / 60), m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const hhmmOf = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

function sched(doc: Doc): Sched | null {
  const raw = doc.data?.schedule as Sched | undefined;
  if (raw && typeof raw === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ""))) {
    // R112: people added with "+ Add crew" (crew rows) count too, not only schedule.workerIds.
    const crew = (Array.isArray(doc.data?.crew) ? doc.data?.crew : []) as { employeeId?: unknown }[];
    const ids = Array.from(new Set([...(raw.workerIds || []).map(String), ...crew.map((row) => String(row.employeeId || "")).filter(Boolean)]));
    return { ...raw, workerIds: ids };
  }
  // Same rule as every other view (lib/job-when): a job with a start time and a date counts.
  const when = derivedWhen(doc.data as Record<string, unknown> | undefined);
  return when ? ({ ...when, status: "scheduled" } as unknown as Sched) : null;
}
function span(s: Sched) {
  if (!s.startTime || !/^\d{2}:\d{2}$/.test(s.startTime)) return null;
  const start = mins(s.startTime);
  const end = s.endTime && /^\d{2}:\d{2}$/.test(s.endTime) && mins(s.endTime) > start ? mins(s.endTime) : start + DEFAULT_JOB_MINUTES;
  return { start, end };
}
export function readOverrides(value: unknown): Override[] {
  if (!Array.isArray(value)) return [];
  return value.filter((o) => o && typeof o === "object" && (o as Override).workerId && (o as Override).otherDocId)
    .map((o) => ({ workerId: String((o as Override).workerId), otherDocId: String((o as Override).otherDocId), at: String((o as Override).at || "") }));
}
const titleOf = (doc: Doc) => String(doc.data?.invoiceNumber || doc.title || "another job");

/** Other jobs that day for these people (their booked blocks), sorted by start. */
export function bookedBlocks(docs: Doc[], docId: string, date: string, workerIds: string[]): Block[] {
  const out: Block[] = [];
  if (!date || !workerIds.length) return out;
  for (const doc of docs) {
    if (!doc || doc.id === docId) continue;
    const s = sched(doc);
    if (!s || s.date !== date || s.status === "done") continue;
    const t = span(s);
    if (!t) continue;
    for (const id of s.workerIds || []) if (workerIds.includes(String(id))) out.push({ docId: doc.id, title: titleOf(doc), workerId: String(id), ...t, date });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Overlaps for this job's people, minus pairs the owner already booked anyway (override on either job). */
export function bookingConflicts(docs: Doc[], docId: string, mine: Sched, extraOverrides: Override[] = []): Conflict[] {
  const t = span(mine);
  if (!t || !mine.date || mine.status === "done") return [];
  const own = [...readOverrides(mine.overrides), ...extraOverrides];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return bookedBlocks(docs, docId, mine.date, (mine.workerIds || []).map(String))
    .filter((b) => b.start < t.end && t.start < b.end)
    .filter((b) => !own.some((o) => o.workerId === b.workerId && o.otherDocId === b.docId))
    .filter((b) => !readOverrides(sched(byId.get(b.docId) || { id: "" })?.overrides).some((o) => o.workerId === b.workerId && o.otherDocId === docId))
    .map((b) => ({ ...b, mine: t }));
}

/** Earliest start (15-minute steps, 7 AM to 8 PM end) with no overlap for any of these people, or "". */
export function nextOpenSlot(docs: Doc[], docId: string, date: string, workerIds: string[], duration: number, from = 7 * 60): string {
  const blocks = bookedBlocks(docs, docId, date, workerIds);
  for (let start = Math.ceil(from / 15) * 15; start + duration <= 20 * 60; start += 15) {
    if (!blocks.some((b) => b.start < start + duration && start < b.end)) return hhmmOf(start);
  }
  return "";
}

/** Every unresolved double-booking across all jobs, once per pair (re-checked after each sync; Help R26). */
export function allConflicts(docs: Doc[]) {
  const seen = new Set<string>();
  const out: { docId: string; otherDocId: string; workerId: string; title: string; otherTitle: string; date: string; start: number; end: number }[] = [];
  for (const doc of docs) {
    const s = sched(doc);
    if (!s) continue;
    for (const c of bookingConflicts(docs, doc.id, s)) {
      const key = [doc.id, c.docId].sort().join("|") + "|" + c.workerId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ docId: doc.id, otherDocId: c.docId, workerId: c.workerId, title: titleOf(doc), otherTitle: c.title, date: c.date, start: Math.max(c.start, c.mine.start), end: Math.min(c.end, c.mine.end) });
    }
  }
  return out;
}

/** R112: overlaps for one job as it is saved now (any path that sets a time or crew). */
export function conflictsForDoc(docs: Doc[], doc: Doc): Conflict[] {
  const s = sched(doc);
  return s ? bookingConflicts(docs.filter((item) => item.id !== doc.id), doc.id, s) : [];
}

/** R112: same job moved to the next open time for its people (same date and length), or null. */
export function moveToNextOpen(docs: Doc[], doc: Doc): { startTime: string; endTime: string } | null {
  const s = sched(doc);
  const t = s && span(s);
  if (!s || !t || !s.date) return null;
  const length = t.end - t.start;
  const start = nextOpenSlot(docs, doc.id, s.date, (s.workerIds || []).map(String), length, t.start);
  if (!start) return null;
  return { startTime: start, endTime: hhmmOf(mins(start) + length) };
}

/** Doc ids that are in an unresolved same-worker overlap right now. */
export function clashingIds(docs: Doc[]) {
  return new Set(allConflicts(docs).flatMap((c) => [c.docId, c.otherDocId]));
}
