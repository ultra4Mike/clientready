import { isUuid, saveCloudDocument } from "@/lib/cloud-docs";
import { supabase } from "@/lib/supabase";
import { markSynced } from "@/lib/sync-status";
import { readSchedule, syncScheduleCrewJobs } from "@/lib/schedule";
import { moneySnapshot } from "@/lib/change-orders";

export type Frequency = "weekly" | "monthly" | "days";
export type Recurring = {
  frequency: Frequency;
  intervalDays?: number;
  nextRunDate: string; // YYYY-MM-DD
  active: boolean;
  lastGeneratedId?: string;
  /** Day of month the monthly schedule aims for, so Jan 31 -> Feb 28 -> Mar 31 instead of drifting to the 28th. */
  anchorDay?: number;
};
export type RecurringFrom = { id: string; number: string; period?: string };

type Doc = { id: string; type: string; title: string; clientName: string; createdAt: string; data: Record<string, unknown> };

const DOCS_KEY = "clientready-documents";
/** Most drafts made for one schedule in one pass; older missed periods are skipped. */
export const CATCH_UP_CAP = 12;

const isYmd = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parse(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(value: string, days: number) {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return ymd(date);
}
function daysBetween(from: string, to: string) {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000);
}

export function readRecurring(value: unknown): Recurring | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Recurring>;
  const frequency = raw.frequency === "weekly" || raw.frequency === "monthly" || raw.frequency === "days" ? raw.frequency : null;
  if (!frequency || !isYmd(raw.nextRunDate)) return null;
  const interval = Math.max(1, Math.floor(Number(raw.intervalDays) || 0));
  return {
    frequency,
    ...(frequency === "days" ? { intervalDays: interval || 30 } : {}),
    nextRunDate: String(raw.nextRunDate),
    active: raw.active !== false,
    ...(raw.lastGeneratedId ? { lastGeneratedId: String(raw.lastGeneratedId) } : {}),
    ...(frequency === "monthly" ? { anchorDay: Number(raw.anchorDay) || parse(String(raw.nextRunDate)).getDate() } : {}),
  };
}

export function readRecurringFrom(value: unknown): RecurringFrom | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<RecurringFrom>;
  if (!raw.id) return null;
  return { id: String(raw.id), number: String(raw.number || ""), ...(raw.period ? { period: String(raw.period) } : {}) };
}

/** The run date after `date`. Monthly keeps the anchor day, clamped to short months. */
export function nextAfter(schedule: Recurring, date: string) {
  if (schedule.frequency === "weekly") return addDays(date, 7);
  if (schedule.frequency === "days") return addDays(date, schedule.intervalDays || 30);
  const current = parse(date);
  const anchor = schedule.anchorDay || current.getDate();
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const last = new Date(year, month + 1, 0).getDate();
  return ymd(new Date(year, month, Math.min(anchor, last)));
}

function readDocs(): Doc[] {
  try {
    const raw = window.localStorage.getItem(DOCS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function numberOf(doc: Doc) {
  return String(doc.data?.invoiceNumber || doc.title);
}

function nextInvoiceNumber(docs: Doc[]) {
  let highest = 1000;
  for (const doc of docs) {
    if (doc.type !== "invoice") continue;
    const match = String(doc.data?.invoiceNumber || doc.title || "").match(/(\d+)/);
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
  }
  return `INV-${highest + 1}`;
}

/** Drafts already made for this schedule, found by search so the template never has to list them. */
export function generatedFrom(docs: Doc[], templateId: string) {
  return docs.filter((doc) => doc.type === "invoice" && readRecurringFrom(doc.data?.recurringFrom)?.id === templateId);
}

const NOT_COPIED = [
  "payments", "paymentAmount", "paymentMethod", "paymentDate", "paymentRef", "paidDate", "paidAt",
  "signature", "proposalSignature", "photos", "jobCosts", "crew",
  "changeOrderOf", "fromProposal", "changeOrderNotes", "recurring", "recurringFrom", "recurringReview", "approval", "schedule", "jobTime", "updatedAt", "reviews", "stages", "emailLog", "crewReport", "noLateFee",
];

/** Data for a fresh draft from the template: client, items (with tags), discount, tax, notes, pay link, style. */
export function recurringDraftData(template: Doc, number: string, period: string) {
  const data = { ...(template.data || {}) };
  for (const key of NOT_COPIED) delete data[key];
  const termDays = isYmd(template.data?.invoiceDate) && isYmd(template.data?.dueDate)
    ? Math.max(0, daysBetween(String(template.data.invoiceDate), String(template.data.dueDate)))
    : 14;
  return {
    ...data,
    invoiceNumber: number,
    invoiceDate: period,
    dueDate: addDays(period, termDays),
    status: "draft",
    // Pending until the user saves it in the form (the form rebuilds data without this key)
    // or its status moves off draft anywhere (e.g. marked sent).
    recurringReview: "pending",
    recurringFrom: { id: template.id, number: numberOf(template), period },
    ...nextJob(template, period),
  };
}

/**
 * When the template is a scheduled job, the draft gets the same job (time, crew, crew note)
 * on its period date, status "scheduled". Past periods (catch-up) get no job.
 */
function nextJob(template: Doc, period: string) {
  const schedule = readSchedule(template.data);
  if (!schedule || period < ymd(new Date())) return {};
  return { schedule: { ...schedule, date: period, status: "scheduled", updatedAt: new Date().toISOString() } };
}

/** A draft for this schedule + period that another device already put in the cloud, if any. */
async function cloudDraftFor(templateId: string, period: string): Promise<Doc | null> {
  if (!isUuid(templateId)) return null;
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("data->recurringFrom->>id", templateId)
    .eq("data->recurringFrom->>period", period)
    .limit(1);
  const row = !error && Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    id: row.id, type: row.type, title: row.title || "", clientName: row.client_name || "",
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : "", data: row.data || {},
  };
}

/**
 * Changes only data.recurring on the stored template. Throws if any money, status or payment
 * field would differ, so the schedule can never touch what the client owes.
 */
export function updateRecurringBlock<T extends Doc>(docs: T[], templateId: string, patch: Partial<Recurring>) {
  const index = docs.findIndex((doc) => doc.id === templateId);
  if (index < 0) return null;
  const template = docs[index];
  const current = readRecurring(template.data?.recurring);
  if (!current) return null;
  const before = moneySnapshot(template.data);
  const updated = { ...template, data: { ...template.data, recurring: { ...current, ...patch } } } as T;
  if (moneySnapshot(updated.data) !== before) throw new Error("Recurring update would change money fields on the template");
  const next = [...docs];
  next[index] = updated;
  return { docs: next, template: updated };
}

/** Runs `work` while holding a cross-tab lock, or skips it when another tab is already running. */
async function withLock(work: () => Promise<number>) {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks) {
    return locks.request("clientready-recurring", { ifAvailable: true }, async (lock) => (lock ? work() : 0));
  }
  // Fallback lease in localStorage for browsers without the Web Locks API.
  const key = "clientready-recurring-lease";
  const now = Date.now();
  const lease = Number(window.localStorage.getItem(key) || 0);
  if (lease > now) return 0;
  const mine = String(now + 30000);
  window.localStorage.setItem(key, mine);
  if (window.localStorage.getItem(key) !== mine) return 0;
  try {
    return await work();
  } finally {
    window.localStorage.removeItem(key);
  }
}

/**
 * Makes one draft for one period of a schedule, unless a draft for that period already exists,
 * then advances the template's schedule. Reads storage fresh each time. Returns the draft id, or "".
 */
async function generateOne(templateId: string, period: string, nextRun: string) {
  const docs = readDocs();
  const template = docs.find((doc) => doc.id === templateId && doc.type === "invoice");
  if (!template) return "";
  const existing = generatedFrom(docs, templateId).find((doc) => readRecurringFrom(doc.data?.recurringFrom)?.period === period);
  let draftId = existing?.id || "";
  let list = docs;
  // Another device may have made it already (local copy not merged yet): adopt that one.
  const remote = existing ? null : await cloudDraftFor(templateId, period);
  if (remote) {
    draftId = remote.id;
    list = [...readDocs().filter((doc) => doc.id !== remote.id), remote];
  }
  if (!existing && !remote) {
    const number = nextInvoiceNumber(docs);
    const draft: Doc = {
      id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      type: "invoice",
      title: number,
      clientName: template.clientName,
      createdAt: new Date().toLocaleDateString(),
      data: recurringDraftData(template, number, period),
    };
    const localId = draft.id;
    draft.id = await saveCloudDocument(draft);
    // Insert refused (the database allows one draft per schedule + period): another device won the race.
    const winner = !isUuid(draft.id) && isUuid(templateId) ? await cloudDraftFor(templateId, period) : null;
    if (winner) {
      markSynced(localId);
      Object.assign(draft, winner);
    } else if (draft.data.schedule) {
      await syncScheduleCrewJobs(draft);
    }
    draftId = draft.id;
    list = [...readDocs().filter((doc) => doc.id !== draft.id), draft];
  }
  const advanced = updateRecurringBlock(list, templateId, { nextRunDate: nextRun, lastGeneratedId: draftId });
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(advanced ? advanced.docs : list));
  if (advanced) {
    await saveCloudDocument(advanced.template);
    // saveCloudDocument stamps updatedAt on the object; store that stamp too.
    const latest = readDocs().map((doc) => (doc.id === templateId ? advanced.template : doc));
    window.localStorage.setItem(DOCS_KEY, JSON.stringify(latest));
  }
  return draftId;
}

/**
 * Catches up every active schedule whose next run date is today or earlier.
 * Choice: one draft per missed period (so each billing period gets its invoice), at most
 * CATCH_UP_CAP per schedule per pass; anything older is skipped and the schedule jumps ahead.
 * Returns how many drafts were made.
 */
export async function runDueRecurring(today = ymd(new Date())) {
  return withLock(async () => {
    let made = 0;
    for (const template of readDocs()) {
      if (template.type !== "invoice") continue;
      const schedule = readRecurring(template.data?.recurring);
      if (!schedule || !schedule.active || schedule.nextRunDate > today) continue;
      const periods: string[] = [];
      let date = schedule.nextRunDate;
      while (date <= today && periods.length < 1000) {
        periods.push(date);
        date = nextAfter(schedule, date);
      }
      const due = periods.slice(-CATCH_UP_CAP);
      for (let i = 0; i < due.length; i += 1) {
        const following = i + 1 < due.length ? due[i + 1] : date;
        const before = generatedFrom(readDocs(), template.id).length;
        const id = await generateOne(template.id, due[i], following);
        if (id && generatedFrom(readDocs(), template.id).length > before) made += 1;
      }
    }
    return made;
  });
}

/** "Generate next invoice now": makes the draft for the upcoming period early and advances the schedule. */
export async function generateNextNow(templateId: string) {
  let draftId = "";
  const ran = await withLock(async () => {
    const template = readDocs().find((doc) => doc.id === templateId);
    const schedule = readRecurring(template?.data?.recurring);
    if (!template || !schedule) return 0;
    draftId = await generateOne(templateId, schedule.nextRunDate, nextAfter(schedule, schedule.nextRunDate));
    return draftId ? 1 : 0;
  });
  return ran ? draftId : "";
}

/** A generated draft nobody has reviewed: still marked pending and still a draft. */
export function isPendingRecurringDraft(doc: { type: string; data?: Record<string, unknown> }) {
  return doc.type === "invoice" && doc.data?.recurringReview === "pending" && (doc.data?.status || "draft") === "draft";
}

export function recurringDraftsReady(docs: { type: string; data?: Record<string, unknown> }[]) {
  return docs.filter(isPendingRecurringDraft).length;
}

/**
 * The schedule to store when the form is saved. Keeps what the background run wrote
 * (lastGeneratedId, an advanced nextRunDate) unless the user changed the date in the form.
 */
export function scheduleFromForm(
  stored: Recurring | null,
  form: { frequency: Frequency | "off"; intervalDays: string; nextRunDate: string; loadedNextRunDate: string; today: string },
): Recurring | null {
  if (form.frequency === "off") return stored ? { ...stored, active: false } : null;
  const nextRunDate = stored && form.nextRunDate === form.loadedNextRunDate ? stored.nextRunDate : form.nextRunDate || form.today;
  const anchorDay = stored?.anchorDay && stored.nextRunDate === nextRunDate ? stored.anchorDay : Number(nextRunDate.slice(8, 10));
  return {
    frequency: form.frequency,
    ...(form.frequency === "days" ? { intervalDays: Math.max(1, Math.floor(Number(form.intervalDays) || 30)) } : {}),
    nextRunDate,
    active: true,
    ...(stored?.lastGeneratedId ? { lastGeneratedId: stored.lastGeneratedId } : {}),
    ...(form.frequency === "monthly" ? { anchorDay } : {}),
  };
}
