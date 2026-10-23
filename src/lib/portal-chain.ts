/**
 * Portal home: the server's chain answer (/api/doc-chain, same chainInfo as the client page and checkout)
 * wins over the list-only math. The portal list can miss an earlier version (e.g. it is filed under another
 * client name), so computing a revision's owed from the list alone dropped its chain credits ($240, not $160).
 */
export type ChainAnswer = { replaced?: { number?: string } | null; revision?: { owed?: number } | null } | null | undefined;

export function portalRowOwed(listOwed: number, info: ChainAnswer): { owed: number; replacedNumber: string | null } {
  if (info?.replaced) return { owed: 0, replacedNumber: String(info.replaced.number || "") };
  if (info?.revision && typeof info.revision.owed === "number" && Number.isFinite(info.revision.owed)) return { owed: Math.max(0, Math.round(info.revision.owed * 100) / 100), replacedNumber: null };
  return { owed: listOwed, replacedNumber: null };
}

/** Status pill text on /invoice-view: a version replaced by a sent revision reads "replaced" (shown uppercase), never "sent". */
export function viewStatusLabel(status: string, replaced: boolean) {
  if (["void", "voided"].includes(status)) return "void";
  if (replaced) return "replaced";
  return status === "paid" ? "✓ paid" : status;
}
