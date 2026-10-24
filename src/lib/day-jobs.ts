import { scheduledJobs } from "@/lib/scheduled-jobs";
import { expandJobDays } from "@/lib/job-days";
import { visitRoot } from "@/lib/client-timeline";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };

/**
 * QA4: the jobs on one day, the same set the calendar shows: every day of multi-day jobs, no void/deleted,
 * and one job per visit (a proposal and the invoice made from it on the same day show once, as the invoice).
 */
export function jobsOnDay<T extends Doc>(docs: T[], day: string) {
  const live = docs.filter((doc) => !["void", "voided", "deleted"].includes(String(doc.data?.status || "")) && !doc.data?.deleted && !(doc as { deleted?: boolean }).deleted);
  const jobs = expandJobDays(scheduledJobs(live)).filter((job) => job.schedule.date === day);
  const byVisit = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) {
    const key = `${visitRoot(job.doc as never, live as never)}|${job.schedule.startTime || ""}`;
    const seen = byVisit.get(key);
    if (!seen || (seen.doc.type === "proposal" && job.doc.type === "invoice")) byVisit.set(key, job);
  }
  return [...byVisit.values()].sort((a, b) => (a.schedule.startTime || "99:99").localeCompare(b.schedule.startTime || "99:99"));
}
