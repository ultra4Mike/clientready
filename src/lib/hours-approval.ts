// Owner approval of crew hours per job (data.hoursApprovals, keyed by employee id; owner-only document data).
export type HoursApproval = { hours: number; basis: "clocked" | "scheduled" | "paid hours"; at: string; revokedAt?: string };

export function readHoursApprovals(value: unknown): Record<string, HoursApproval> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, HoursApproval> = {};
  for (const [id, raw] of Object.entries(value as Record<string, Partial<HoursApproval>>)) {
    if (!raw || typeof raw !== "object" || !raw.at) continue;
    const basis = raw.basis === "clocked" || raw.basis === "scheduled" ? raw.basis : "paid hours";
    out[id] = { hours: Number(raw.hours) || 0, basis, at: String(raw.at), ...(raw.revokedAt ? { revokedAt: String(raw.revokedAt) } : {}) };
  }
  return out;
}

const stamp = (a: HoursApproval) => (a.revokedAt && a.revokedAt > a.at ? a.revokedAt : a.at);
/** Merge two copies: per worker the newer decision wins, so a stale/offline save never drops an approval (Help R27). */
export function mergeHoursApprovals(mine: unknown, cloud: unknown): Record<string, HoursApproval> {
  const a = readHoursApprovals(mine), b = readHoursApprovals(cloud);
  const out: Record<string, HoursApproval> = { ...b };
  for (const [id, row] of Object.entries(a)) if (!out[id] || stamp(row) > stamp(out[id])) out[id] = row;
  return out;
}
