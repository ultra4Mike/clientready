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
