/**
 * One-time repair for jobs whose crew rows drifted from the schedule (before crew rows followed it),
 * and jobs with a start time that were never put on the calendar. planReconcile only reports; the
 * owner reviews the list, then applyReconcile saves each job's schedule, which rewrites its crew rows
 * (paid-to-worker rows keep their date), the crew's view (/crew) and the calendar. Invoice dates,
 * numbers, due dates and money are never changed.
 */
import { followSchedule, readSchedule, saveSchedule } from "@/lib/schedule";

type Doc = { id: string; type?: string; title?: string; clientName?: string; data?: Record<string, unknown> };
type Row = { employeeId?: string; name?: string; workDate?: string; startTime?: string; endTime?: string; paidToWorker?: boolean };
export type ReconcileChange = { docId: string; number: string; client: string; what: string; from: string; to: string };

export function planReconcile(docs: Doc[]): ReconcileChange[] {
  const out: ReconcileChange[] = [];
  for (const doc of docs) {
    if (doc.type === "proposal") continue;
    const data = doc.data || {};
    const schedule = readSchedule(data);
    if (!schedule) continue;
    const number = String(data.invoiceNumber || doc.title || "Job");
    const client = String(data.clientName || doc.clientName || "");
    const when = (d?: string, t?: string) => `${d || "no date"}${t ? ` ${t}` : ""}`;
    // R113: a job with a start time but no stored schedule is ALREADY on the calendar (same resolver, lib/job-when),
    // so it is not listed as "Unscheduled". Only crew rows that differ from the resolved time are listed.
    const rows = (Array.isArray(data.crew) ? data.crew : []) as Row[];
    for (const row of rows) {
      const next = followSchedule(row, schedule, rows);
      if ((next.workDate || "") !== (row.workDate || "") || (next.startTime || "") !== (row.startTime || "")) {
        out.push({ docId: doc.id, number, client, what: `Crew: ${row.name || "worker"}`, from: when(row.workDate, row.startTime), to: when(next.workDate, next.startTime) });
      }
    }
  }
  return out;
}

export async function applyReconcile(changes: ReconcileChange[]) {
  const ids = Array.from(new Set(changes.map((c) => c.docId)));
  let done = 0;
  for (const id of ids) {
    const docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as Doc[];
    const doc = docs.find((d) => d.id === id);
    const schedule = doc ? readSchedule(doc.data) : null;
    if (!schedule) continue;
    await saveSchedule(id, schedule);
    done += 1;
  }
  return done;
}
