/** Redesign 2: crew "Next job" and "Recent jobs" from the crew's own job rows (dates from the one schedule). */
type Row = { id: string; job_date: string; start_time: string; schedule_status?: string; done_confirmed?: boolean; status?: string };
const isDone = (row: Row) => row.schedule_status === "done" || row.status === "done" || Boolean(row.done_confirmed);
const key = (row: Row) => `${row.job_date} ${row.start_time || "99:99"}`;

export function nextJob<T extends Row>(rows: T[], today: string, nowHhmm = ""): T | null {
  // Today's unfinished jobs count even if their start time passed (they may be running late).
  void nowHhmm;
  const open = rows.filter((row) => row.job_date && !isDone(row) && row.job_date >= today);
  return open.sort((a, b) => key(a).localeCompare(key(b)))[0] || null;
}

export function recentJobs<T extends Row>(rows: T[], today: string, limit = 5): T[] {
  return rows.filter((row) => row.job_date && (row.job_date < today || isDone(row))).sort((a, b) => key(b).localeCompare(key(a))).slice(0, limit);
}
