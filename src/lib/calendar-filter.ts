/**
 * R127: what the calendar shows, by approval. Pure rules (no storage, no network) plus a per-user
 * localStorage preference. The schedule itself is never changed by a filter.
 *
 * approved: an accepted/approved proposal, or an invoice that is sent/paid/overdue or was made from a proposal.
 * pending:  a proposal that was sent but is not approved yet.
 * draft:    a draft invoice or draft proposal.
 */
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
export const PRESET_LABEL: Record<Preset, string> = { approved: "Approved only", drafts: "Drafts only", proposals: "Proposals only", all: "All" };

export function approvalOf(doc: Doc): Approval {
  const data = doc.data || {};
  const status = String(data.status || "draft");
  if (doc.type === "proposal") {
    const approval = data.approval as { status?: string } | undefined;
    if (status === "accepted" || approval?.status === "approved") return "approved";
    return status === "draft" ? "draft" : "pending";
  }
  if ((data.fromProposal as { id?: string } | undefined)?.id) return "approved";
  return status === "draft" ? "draft" : "approved";
}
export const isTentative = (doc: Doc) => approvalOf(doc) !== "approved";

export function visibleOnCalendar(doc: Doc, f: CalendarFilter) {
  if (doc.type === "proposal" ? !f.proposals : !f.invoices) return false;
  const a = approvalOf(doc);
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
