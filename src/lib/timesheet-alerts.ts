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
