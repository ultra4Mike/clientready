/**
 * When a job happens: the one shared rule every view uses (calendar, invoice, crew rows, /crew,
 * dashboard, Today, conflicts, employees, reports). Pure (no imports) so server code and unit tests
 * can use it. data.schedule wins; a job with a start time but no schedule is still on the calendar:
 * date = the crew work date, else the invoice (issue) date. The invoice date itself is never changed.
 */
export type JobWhen = { date: string; startTime: string; endTime?: string; workerIds: string[]; derived: boolean };

const isTime = (v: unknown) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);

/** "2026-10-16" or "10/16/2026" -> "2026-10-16"; anything else -> "". */
export function isoDate(value: unknown) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
}

/** The schedule a job without data.schedule gets from its Job start/end and dates, or null. */
export function derivedWhen(data: Record<string, unknown> | undefined): JobWhen | null {
  if (!data || !isTime(data.jobStart) || data.unscheduled) return null; // QA4: unscheduled stays off the calendar
  const crew = (Array.isArray(data.crew) ? data.crew : []) as { employeeId?: unknown; workDate?: unknown }[];
  const date = [...crew.map((row) => row.workDate), data.invoiceDate].map(isoDate).find(Boolean);
  if (!date) return null;
  const start = String(data.jobStart), end = String(data.jobEnd || "");
  return { date, startTime: start, ...(isTime(end) && end !== start ? { endTime: end } : {}) /* cal24: an earlier end = past midnight */, workerIds: Array.from(new Set(crew.map((row) => String(row.employeeId || "")).filter(Boolean))), derived: true };
}

/** data.schedule (date/time/workers only) or the derived one. */
export function jobWhen(data: Record<string, unknown> | undefined): JobWhen | null {
  const raw = data?.schedule as { date?: unknown; startTime?: unknown; endTime?: unknown; workerIds?: unknown } | undefined;
  if (raw && typeof raw === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ""))) {
    return { date: String(raw.date), startTime: isTime(raw.startTime) ? String(raw.startTime) : "", ...(isTime(raw.endTime) ? { endTime: String(raw.endTime) } : {}), workerIds: Array.isArray(raw.workerIds) ? raw.workerIds.map(String) : [], derived: false };
  }
  return derivedWhen(data);
}

const ampm = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
/** QA4: printouts show the job date together with its time, e.g. "Sun, Oct 25, 2026 · 9:00 AM – 11:00 AM". */
export function whenLabel(data: Record<string, unknown> | undefined): string {
  const when = jobWhen(data);
  if (!when) return "";
  const [y, mo, d] = when.date.split("-").map(Number);
  const day = new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = when.startTime ? ` · ${ampm(when.startTime)}${when.endTime ? ` – ${ampm(when.endTime)}` : ""}` : "";
  return `${day}${time}`;
}
