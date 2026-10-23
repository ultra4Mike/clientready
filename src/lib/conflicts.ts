import { derivedWhen } from "./job-when";
import { isUnsentDraft, needsApproval } from "./doc-status";
import { addDaysYmd, DAY_MINUTES, jobMinutes } from "./overnight";

/** Clash rule: an unapproved proposal / pending change order or an unsent draft invoice is tentative (soft warning); approved or sent work is hard. */
export const softClash = (doc: Doc, allDocs: Doc[] = []) => { const d = doc as Doc & { type?: string }; return needsApproval(d, allDocs) || (d.type !== "proposal" && isUnsentDraft(d)); };
// Double-booking rules. The same person on two jobs whose times overlap is blocked unless the owner taps
// "Book anyway" (recorded on the job as schedule.overrides). Different people may overlap freely.
// Jobs without a start time ("Any time") and done jobs are never compared. A job with no end time counts as 1 hour.
export type Override = { workerId: string; otherDocId: string; at: string };
export type Block = { docId: string; title: string; workerId: string; start: number; end: number; date: string; /** R127: the other job is not approved yet (soft warning). */ tentative?: boolean };
export type Conflict = Block & { mine: { start: number; end: number } };
type Sched = { date?: string; startTime?: string; endTime?: string; workerIds?: string[]; status?: string; overrides?: unknown };
type Doc = { id: string; title?: string; data?: Record<string, unknown> };

/** A job with a start but no end counts as this long everywhere (R112). */
export const DEFAULT_JOB_MINUTES = 60;
const mins = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
export const clockText = (raw: number) => {
  // cal24: minutes past midnight (overnight jobs) or before it (yesterday's) wrap to the clock time.
  const total = ((Math.round(raw) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60), m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const hhmmOf = (raw: number) => { const total = ((Math.round(raw) % 1440) + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; };

function sched(doc: Doc): Sched | null {
  // R119: void / deleted jobs never clash.
  if (["void", "voided", "deleted"].includes(String(doc.data?.status || "")) || doc.data?.deleted) return null;
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
  // cal24: an end before the start runs past midnight (22:00-04:00 = 6 h, ending 28:00 on the start day's clock).
  return { start, end: start + jobMinutes(s.startTime, s.endTime, DEFAULT_JOB_MINUTES) };
}
export function readOverrides(value: unknown): Override[] {
  if (!Array.isArray(value)) return [];
  return value.filter((o) => o && typeof o === "object" && (o as Override).workerId && (o as Override).otherDocId)
    .map((o) => ({ workerId: String((o as Override).workerId), otherDocId: String((o as Override).otherDocId), at: String((o as Override).at || "") }));
}
const fromId = (doc?: Doc) => String((doc?.data?.fromProposal as { id?: string } | undefined)?.id || "");
/** R119: a proposal and the invoice made from it, or a device/cloud copy of one number, are one job, not a clash. */
function sameJob(a: Doc, b?: Doc) {
  if (!b) return false;
  if (fromId(a) === b.id || fromId(b) === a.id) return true;
  const n = (d: Doc) => String(d.data?.invoiceNumber || "").trim().toLowerCase();
  return Boolean(n(a)) && n(a) === n(b) && (a as { type?: string }).type === (b as { type?: string }).type && (a as { clientName?: string }).clientName === (b as { clientName?: string }).clientName;
}
const titleOf = (doc: Doc) => String(doc.data?.invoiceNumber || doc.title || "another job");

/** Other jobs that day for these people (their booked blocks), sorted by start. */
export function bookedBlocks(docs: Doc[], docId: string, date: string, workerIds: string[], { ignoreTentative = false }: { ignoreTentative?: boolean } = {}): Block[] {
  const out: Block[] = [];
  if (!date || !workerIds.length) return out;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  for (const doc of docs) {
    if (!doc || doc.id === docId || sameJob(doc, byId.get(docId))) continue;
    const s = sched(doc);
    if (!s || s.status === "done") continue;
    // cal24: the day before (an overnight job still running after midnight) and the day after (my overnight job runs into it),
    // shifted onto this day's clock (minutes can be negative or past 24:00).
    const offset = s.date === date ? 0 : s.date === addDaysYmd(date, -1) ? -DAY_MINUTES : s.date === addDaysYmd(date, 1) ? DAY_MINUTES : null;
    if (offset === null) continue;
    const tentative = softClash(doc, docs);
    if (ignoreTentative && tentative) continue;
    const raw = span(s);
    if (!raw) continue;
    const t = { start: raw.start + offset, end: raw.end + offset };
    if (offset < 0 && t.end <= 0) continue;
    for (const id of s.workerIds || []) if (workerIds.includes(String(id))) out.push({ docId: doc.id, title: titleOf(doc), workerId: String(id), ...t, date: String(s.date), tentative });
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
    .map((b) => ({ ...b, tentative: Boolean(b.tentative || (byId.get(docId) && softClash(byId.get(docId) as Doc, docs))), mine: t }));
}

/**
 * Earliest start (15-minute steps) from `from` (default 7 AM) to 11:45 PM with no overlap for any of these people, or "".
 * cal24: night starts are allowed and a job may run past midnight (checked against the next day's jobs too).
 */
export function nextOpenSlot(docs: Doc[], docId: string, date: string, workerIds: string[], duration: number, from = 7 * 60, opts: { ignoreTentative?: boolean } = {}): string {
  const blocks = bookedBlocks(docs, docId, date, workerIds, opts);
  for (let start = Math.max(0, Math.ceil(from / 15) * 15); start < DAY_MINUTES; start += 15) {
    if (!blocks.some((b) => b.start < start + duration && start < b.end)) return hhmmOf(start);
  }
  return "";
}

/** R127: approved clashes block (Book anyway / another time / worker); unapproved ones only warn. */
export function splitConflicts<T extends { tentative?: boolean }>(list: T[]) {
  return { hard: list.filter((c) => !c.tentative), soft: list.filter((c) => c.tentative) };
}

/** Every unresolved double-booking across all jobs, once per pair (re-checked after each sync; Help R26). */
export function allConflicts(docs: Doc[]) {
  const seen = new Set<string>();
  const out: { docId: string; otherDocId: string; workerId: string; title: string; otherTitle: string; date: string; start: number; end: number; tentative: boolean }[] = [];
  for (const doc of docs) {
    const s = sched(doc);
    if (!s) continue;
    for (const c of bookingConflicts(docs, doc.id, s)) {
      const key = [doc.id, c.docId].sort().join("|") + "|" + c.workerId;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ docId: doc.id, otherDocId: c.docId, workerId: c.workerId, title: titleOf(doc), otherTitle: c.title, date: c.date, start: Math.max(c.start, c.mine.start), end: Math.min(c.end, c.mine.end), tentative: Boolean(c.tentative) });
    }
  }
  return out;
}

/** R112: overlaps for one job as it is saved now (any path that sets a time or crew). */
export function conflictsForDoc(docs: Doc[], doc: Doc): Conflict[] {
  const s = sched(doc);
  return s ? bookingConflicts([...docs.filter((item) => item.id !== doc.id), doc], doc.id, s) : [];
}

/** R112: same job moved to the next open time for its people (same date and length), or null. */
export function moveToNextOpen(docs: Doc[], doc: Doc): { startTime: string; endTime: string } | null {
  const s = sched(doc);
  const t = s && span(s);
  if (!s || !t || !s.date) return null;
  const length = t.end - t.start;
  const start = nextOpenSlot(docs, doc.id, s.date, (s.workerIds || []).map(String), length, t.start);
  if (!start) return null;
  return { startTime: start, endTime: hhmmOf((mins(start) + length) % DAY_MINUTES) };
}

/** Doc ids that are in an unresolved same-worker overlap right now. */
export function clashingIds(docs: Doc[], { includeTentative = false }: { includeTentative?: boolean } = {}) {
  // R127: a clash with a job that isn't approved is a soft heads-up, not counted here unless asked.
  return new Set(allConflicts(docs).filter((c) => includeTentative || !c.tentative).flatMap((c) => [c.docId, c.otherDocId]));
}
