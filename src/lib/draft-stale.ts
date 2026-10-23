/** Help retest #3: when is an autosaved "new document" draft no longer worth offering back? */
export const NEW_DRAFT_MAX_HOURS = 24;

type Doc = { id?: string; title?: string; data?: Record<string, unknown> | null };

/**
 * A new-form draft is stale when it is older than ~24 h, or when its number already belongs to a saved
 * document (it was saved, so the record holds it now). Drafts for an opened doc are keyed by that doc's id
 * and are never judged here.
 */
export function newDocDraftStale(payload: { invoiceNumber?: string } | null | undefined, updatedAt: string, savedDocs: Doc[], now = Date.now()): boolean {
  const at = new Date(updatedAt).getTime();
  if (!Number.isFinite(at) || now - at > NEW_DRAFT_MAX_HOURS * 3600000) return true;
  const num = String(payload?.invoiceNumber || "").trim().toLowerCase();
  if (!num) return false;
  return savedDocs.some((doc) => String((doc.data as { invoiceNumber?: string } | null | undefined)?.invoiceNumber || doc.title || "").trim().toLowerCase() === num);
}

/** Help retest #2: links that must always start a blank document (calendar "New job", ?new=1). */
export function wantsFreshDoc(search: string): boolean {
  const params = new URLSearchParams(search);
  return !params.get("id") && (params.has("new") || params.has("visit"));
}
