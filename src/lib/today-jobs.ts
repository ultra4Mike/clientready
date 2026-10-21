import { crewIds, statusLabel } from "@/lib/schedule";
import { scheduledJobs, timeLabel } from "@/lib/scheduled-jobs";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };
export type TodayJob = { docId: string; title: string; client: string; start: string; end: string; status: string; crew: { id: string; name: string }[] };

/** Redesign 1: the dashboard Today block. Reads the one schedule; crew = scheduled workers plus crew rows. No money. */
export function todayJobsWithCrew(docs: Doc[], workers: Map<string, string>, day: string): TodayJob[] {
  return scheduledJobs(docs)
    .filter((job) => job.schedule.date === day)
    .sort((a, b) => (a.schedule.startTime || "99:99").localeCompare(b.schedule.startTime || "99:99"))
    .map(({ doc, schedule }) => {
      const ids = [...new Set([...(schedule.workerIds || []), ...(crewIds(doc.data?.crew) as string[])])];
      return {
        docId: doc.id,
        title: String(doc.data?.invoiceNumber || doc.title || ""),
        client: doc.clientName || "",
        start: timeLabel(schedule.startTime || ""),
        end: timeLabel(schedule.endTime || ""),
        status: statusLabel(schedule),
        crew: ids.map((id) => ({ id, name: workers.get(id) || "Unknown worker" })),
      };
    });
}
