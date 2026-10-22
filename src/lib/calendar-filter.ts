/**
 * R127: what the calendar shows, by approval. Pure rules (no storage, no network) plus a per-user
 * localStorage preference. The schedule itself is never changed by a filter.
 *
 * approved: an accepted/approved proposal, or an invoice that is sent/paid/overdue or was made from a proposal.
 * pending:  a proposal that was sent but is not approved yet.
 * draft:    an unsent draft invoice or proposal.
 */
import { hiddenFromCalendar, isUnsentDraft, needsApproval } from "@/lib/doc-status";

type Doc = { id: string; type?: string; data?: Record<string, unknown> };
export type Approval = "approved" | "pending" | "draft";
export type CalendarFilter = { approved: boolean; pending: boolean; drafts: boolean; invoices: boolean; proposals: boolean };
export type Preset = "all" | "approved" | "drafts" | "proposals";

export const PRESETS: Record<Preset, CalendarFilter> = {
  all: { approved: true, pending: true, drafts: true, invoices: true, proposals: true },
  approved: { approved: true, pending: false, drafts: false, invoices: true, proposals: true },
  drafts: { approved: false, pending: false, drafts: true, invoices: true, proposals: true },
  proposals: { approved: true, pending: true, drafts: true, invoices: false, proposals: true },
};
export const PRESET_LABEL: Record<Preset, string> = { approved: "Approved only", drafts: "Unsent drafts", proposals: "Proposals only", all: "All" };

/**
 * Help live check: buckets use the shared rules in lib/doc-status. "draft" = unsent draft (any type);
 * "pending" = a proposal / change order sent and still waiting on approval; everything else is approved work.
 */
export function approvalOf(doc: Doc, allDocs: Doc[] = []): Approval {
  if (isUnsentDraft(doc)) return "draft";
  return needsApproval(doc, allDocs) ? "pending" : "approved";
}
/** NOT APPROVED tag: only unapproved proposals and change orders sent for approval (never a plain invoice). */
export const isTentative = (doc: Doc, allDocs: Doc[] = []) => needsApproval(doc, allDocs);

/** Void docs and proposals that already have an invoice never show (so "Proposals only" excludes converted ones). */
export function visibleOnCalendar(doc: Doc, f: CalendarFilter, allDocs: Doc[] = []) {
  if (hiddenFromCalendar(doc, allDocs)) return false;
  if (doc.type === "proposal" ? !f.proposals : !f.invoices) return false;
  const a = approvalOf(doc, allDocs);
  return a === "approved" ? f.approved : a === "pending" ? f.pending : f.drafts;
}
export function presetOf(f: CalendarFilter): Preset | "" {
  return (Object.keys(PRESETS) as Preset[]).find((key) => JSON.stringify(PRESETS[key]) === JSON.stringify(f)) || "";
}
/** "Approved only": free time and next open time ignore unapproved jobs. */
export const ignoresTentative = (f: CalendarFilter) => !f.pending && !f.drafts;

const KEY = "clientready-calendar-filter";
const keyFor = () => { try { return `${KEY}::${window.localStorage.getItem("clientready-cache-owner") || "local"}`; } catch { return KEY; } };
export function readCalendarFilter(): CalendarFilter {
  try {
    const raw = JSON.parse(window.localStorage.getItem(keyFor()) || "null") as Partial<CalendarFilter> | null;
    if (raw && typeof raw === "object") return { ...PRESETS.all, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean")) };
  } catch { /* default */ }
  return { ...PRESETS.all };
}
export function saveCalendarFilter(f: CalendarFilter) {
  try { window.localStorage.setItem(keyFor(), JSON.stringify(f)); } catch { /* full */ }
}
