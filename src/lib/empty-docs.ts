import { markSynced, pendingIds } from "@/lib/sync-status";

/**
 * Help retest (7fb0ad8): a never-saved new job with no client and no line items must not become a
 * calendar entry or a "Saved on this device" record, and stray ones made before this fix are swept away.
 */
type Item = { description?: unknown; rate?: unknown };
export type DocContent = { clientName?: unknown; clientCompany?: unknown; contactName?: unknown; clientEmail?: unknown; clientPhone?: unknown; clientAddress?: unknown; clientId?: unknown; items?: unknown; payments?: unknown };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const NO_CLIENT = new Set(["", "no client"]);

/** Real content = a client (any contact detail) or a line item with a description or a price, or a payment. */
export function docHasContent(d: DocContent | null | undefined): boolean {
  if (!d) return false;
  if (!NO_CLIENT.has(text(d.clientName).toLowerCase())) return true;
  if ([d.clientCompany, d.contactName, d.clientEmail, d.clientPhone, d.clientAddress, d.clientId].some((v) => text(v))) return true;
  if (Array.isArray(d.items) && d.items.some((it: Item) => text(it?.description) || Number(it?.rate) > 0)) return true;
  if (Array.isArray(d.payments) && d.payments.length) return true;
  return false;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type LocalDoc = { id?: string; type?: string; data?: (DocContent & { status?: unknown; crewReport?: unknown; recurringFrom?: unknown; changeOrderOf?: unknown }) | null };

/** Only device-only records (never uploaded, so the id is not a cloud uuid), still drafts, with no content. */
export function isEmptyLocalDoc(doc: LocalDoc): boolean {
  if (!doc || !doc.id || UUID.test(doc.id)) return false;
  if (doc.type && doc.type !== "invoice" && doc.type !== "proposal") return false;
  const d = doc.data || {};
  const status = text(d.status) || "draft";
  if (status !== "draft") return false;
  if (d.crewReport || d.recurringFrom || d.changeOrderOf) return false;
  return !docHasContent(d);
}

/** Removes stray empty local docs (and their "waiting to sync" marks). Returns the removed ids. */
export function sweepEmptyLocalDocs(storage: Storage = window.localStorage): string[] {
  try {
    const raw = storage.getItem("clientready-documents");
    const docs = JSON.parse(raw || "[]") as LocalDoc[];
    if (!Array.isArray(docs)) return [];
    const gone = docs.filter(isEmptyLocalDoc).map((d) => String(d.id));
    if (gone.length) storage.setItem("clientready-documents", JSON.stringify(docs.filter((d) => !gone.includes(String(d?.id)))));
    // "Saved on this device (n)" marks for documents that no longer exist on this device can never upload;
    // they only keep the pill amber forever. Queued deletes ("delete:<id>") are left alone.
    const kept = new Set(docs.map((d) => String(d?.id)).filter((id) => !gone.includes(id)));
    try {
      const orphans = pendingIds().filter((id) => !id.startsWith("delete:") && !kept.has(id));
      if (orphans.length) markSynced(...orphans);
    } catch { /* no sync marks here */ }
    return gone;
  } catch { return []; }
}
