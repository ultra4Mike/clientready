/**
 * Client-safe view of a document's approval + append-only history. Mirrors public.public_approval_data /
 * public.public_history_data (deploy29.sql), which is the real boundary: the portal and approval-link RPCs
 * never return owner ids, owner names or internal notes. This copy is defense in depth for the portal page.
 */
export type PublicHistoryEvent = { at: string; event: "approved_by_phone" | "approved_by_owner" | "approval_undone" };

const EVENTS: Record<string, PublicHistoryEvent["event"]> = {
  "Approved by phone": "approved_by_phone",
  "Marked approved by owner": "approved_by_owner",
  "Approval undone by owner": "approval_undone",
};

export function publicHistory(value: unknown): PublicHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  const out: PublicHistoryEvent[] = [];
  for (const e of value) {
    if (!e || typeof e !== "object") continue;
    const raw = e as Record<string, unknown>;
    const event = typeof raw.event === "string" && Object.values(EVENTS).includes(raw.event as PublicHistoryEvent["event"]) ? raw.event as PublicHistoryEvent["event"] : EVENTS[String(raw.action)];
    if (event && typeof raw.at === "string") out.push({ at: raw.at, event });
  }
  return out;
}

const OWNER_APPROVAL_KEYS = ["token", "note", "markedBy", "approvedBy"];
export function publicApproval(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const k of OWNER_APPROVAL_KEYS) delete out[k];
  if (out.method) delete out.approverName; // owner-recorded: approverName holds the owner's name
  return out;
}

export function publicDocData(data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(data || {}) };
  if ("approval" in out) out.approval = publicApproval(out.approval);
  if ("history" in out) out.history = publicHistory(out.history);
  return out;
}

export function publicEventLabel(event: PublicHistoryEvent["event"], businessName: string) {
  const by = businessName.trim() ? ` (recorded by ${businessName.trim()})` : "";
  return event === "approved_by_phone" ? `Approved by phone${by}` : event === "approved_by_owner" ? `Marked approved${by}` : `Approval withdrawn${by}`;
}
