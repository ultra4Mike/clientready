/** Owner Timesheet alerts: an approved day is resolved (shown apart, not counted); unapproved/reopened comes back. */
export type OwnerAlert = { key: string; text: string; open: string; kind?: string; employeeId?: string; date?: string; sticky?: boolean };
export function splitAlerts<T extends OwnerAlert>(list: T[], isApproved: (employeeId: string, date: string) => boolean) {
  const open: T[] = [], resolved: T[] = [];
  for (const a of list) (!a.sticky && a.employeeId && a.date && isApproved(a.employeeId, a.date) ? resolved : open).push(a);
  return { open, resolved };
}
/** "No-show" only when the day has no hours; paid from the schedule with no tap = "No tap recorded". */
export function scheduleAlertLabel(kind: string, paidMinutes: number) {
  if (kind === "no_show") return paidMinutes > 0 ? "No tap recorded" : "No-show";
  return "Late start";
}

type ApprovalLike = { employeeId: string; date: string };
/** A server read that started before an approve/unapprove finished must not undo it: rows saved in this session win. */
export function mergeApprovals<T extends ApprovalLike>(loaded: T[], savedThisSession: T[]) {
  const keys = new Set(savedThisSession.map((a) => `${a.employeeId}|${a.date}`));
  return [...loaded.filter((a) => !keys.has(`${a.employeeId}|${a.date}`)), ...savedThisSession];
}
/** Resolved list: only alerts inside the current pay period (older ones auto-hide). */
export function resolvedInPeriod<T extends { date?: string }>(list: T[], period: { from: string; to: string }) {
  return list.filter((a) => !a.date || (a.date >= period.from && a.date <= period.to));
}

/**
 * pt437u: nothing that says "pending" may show from this device's copy before the week's server read lands
 * (taps come from the server, so a scheduled day looks like a no-show and an approved day like open work).
 * Every pending surface on the Timesheet goes through this one gate: Alerts list/count, Resolved, Needs review
 * filter count, Approve all ready (n), the per-worker status chips, day "!" flags and the orphan-hours notice.
 */
export const LOADING_LABEL = "Loading…";
export function pendingSurfaces<A, R>(loading: boolean, v: { alerts: A[]; resolved: R[]; reviewCount: number; readyCount: number; orphans: string[] }) {
  if (!loading) return { ...v, loading: false as const };
  return { alerts: [] as A[], resolved: [] as R[], reviewCount: 0, readyCount: 0, orphans: [] as string[], loading: true as const };
}
/** Worker week chip: a neutral placeholder while loading, never "Needs review (n)" / "Ready to approve". */
export function statusChip<S extends { kind: string; label: string }>(loading: boolean, status: S) {
  return loading ? { kind: "loading", label: LOADING_LABEL } : status;
}
