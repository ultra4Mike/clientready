import { readSchedule, type Schedule } from "@/lib/schedule";
import { holdsSchedule } from "@/lib/change-order-revision";

type Doc = { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> };

/**
 * The one list of scheduled jobs (calendar, Upcoming, Schedule): invoices and proposals with a
 * schedule block (or the older jobTime + due date). Dates are local YYYY-MM-DD strings, compared as
 * strings, so there is no UTC shift.
 */
export function scheduledJobs<T extends Doc>(docs: T[]) {
  return docs
    .filter((doc) => doc.type === "invoice" || doc.type === "proposal")
    // Change-order revisions: the job shows once, on the version that holds it (draft CO -> original; sent CO -> the CO).
    .filter((doc) => holdsSchedule(docs, doc))
    .flatMap((doc) => {
      const schedule = readSchedule(doc.data);
      return schedule ? [{ doc, schedule }] : [];
    })
    .sort((a, b) => `${a.schedule.date} ${a.schedule.startTime}`.localeCompare(`${b.schedule.date} ${b.schedule.startTime}`));
}

export type ScheduledJob<T extends Doc = Doc> = { doc: T; schedule: Schedule };

export function localYmd(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDaysYmd(value: string, days: number) {
  const [y, m, d] = value.split("-").map(Number);
  return localYmd(new Date(y, m - 1, d + days));
}

export function niceYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
}

export function timeLabel(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
