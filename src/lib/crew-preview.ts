// Owner "Preview as crew" (/crew?preview=sample or /crew?preview=<employee id>).
// Nothing here talks to the server: taps go to a separate on-device store and never become real entries.
export const CREW_PREVIEW_KEY = "clientready-crew-preview";
export type CrewPreview = { mode: "sample" } | { mode: "worker"; employeeId: string };
export type PreviewClock = { id: string; doc_id: string; started_at: string; ended_at: string | null; preview: true };

export function parseCrewPreview(search: string): CrewPreview | null {
  const raw = new URLSearchParams(search).get("preview");
  if (raw == null) return null;
  const v = raw.trim();
  if (!v || v === "sample" || v === "1") return { mode: "sample" };
  // Employee ids are uuids/short ids; anything odd is treated as a sample (no lookup with junk input).
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? { mode: "worker", employeeId: v } : { mode: "sample" };
}

/** Who may preview: a signed-in owner. A person on someone else's crew list never gets preview mode. */
export function mayPreview(userId: string, crewRow: { user_id?: string | null } | null | undefined) {
  if (!userId) return false;
  return !crewRow || crewRow.user_id === userId;
}

/** Sample jobs: made-up client details, no prices or pay. */
export function sampleJobs(today: string) {
  const base = { client_email: "", schedule_status: "scheduled", on_my_way_at: "", done_confirmed: false, hours: "", rate: "", pay: 0, note: "", status: "", checklist: [] as unknown[], cost_lines: [] as string[] };
  return [
    { ...base, id: "preview-1", doc_id: "preview-doc-1", client_name: "Sample client A", client_phone: "555-0100", client_address: "100 Example St", job_date: today, start_time: "09:00", end_time: "11:00", invoice_number: "SAMPLE-1", checklist: [{ id: "c1", text: "Walk the job with the client", done: false }] },
    { ...base, id: "preview-sched-2", doc_id: "preview-doc-2", client_name: "Sample client B", client_phone: "555-0101", client_address: "200 Example Ave", job_date: today, start_time: "13:00", end_time: "15:30", invoice_number: "SAMPLE-2" },
  ];
}

/** Strip anything money-related before showing a worker's rows in preview (same rule as the crew page). */
export function stripPay<T extends Record<string, unknown>>(row: T): T {
  return { ...row, rate: "", pay: 0, amount: undefined, total: undefined, price: undefined };
}

type Store = { get(k: string): string | null; set(k: string, v: string): void };
const ls = (): Store | null => (typeof window === "undefined" ? null : { get: (k) => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) });

export function readPreviewClock(store: Store | null = ls()): PreviewClock[] {
  try { const v = JSON.parse(store?.get(CREW_PREVIEW_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function previewClockTap(kind: "clock-in" | "clock-out", docId: string, at: string, store: Store | null = ls()): PreviewClock[] {
  const rows = readPreviewClock(store);
  let next: PreviewClock[];
  if (kind === "clock-in") next = rows.some((r) => r.doc_id === docId && !r.ended_at) ? rows : [...rows, { id: `preview-clock-${rows.length + 1}`, doc_id: docId, started_at: at, ended_at: null, preview: true }];
  else next = rows.map((r) => (r.doc_id === docId && !r.ended_at ? { ...r, ended_at: at } : r));
  try { store?.set(CREW_PREVIEW_KEY, JSON.stringify(next.slice(-50))); } catch {}
  return next;
}
