"use client";
/**
 * Owner weekly timesheet: every worker, each day's paid hours (day engine), drive time and flags,
 * edit a day, Approve all for the week with Undo, fix-my-time requests, gap/timeout settings.
 * Old clock entries count as taps (clock in = Start job, clock out = End shift), so nothing recorded is lost.
 * Approvals store hours only; recorded job pay rows are not changed here.
 */
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { DOCS_KEY } from "@/lib/doc-sync";
import { readOwnerClock } from "@/lib/clock";
import { readSchedule, readWorkers, type Worker } from "@/lib/schedule";
import { readPaySettings, weekPay, weekOf } from "@/lib/pay-types";
import { decideFix, loadOwnerTimesheet, readLocalTimesheetSettings, saveApprovals, saveTimesheetSettings, type DayApproval } from "@/lib/day-events";
import { applyFixes, buildDay, estimateDriveMinutes, type DaySheet, type FixRequest, type ScheduledJob, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";

const FLAG_LABEL: Record<string, string> = { from_schedule: "From schedule", not_at_site: "Not at site", long_drive: "Long drive", auto_ended: "Auto-ended", fix_requested: "Fix requested", edited: "Edited" };
const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const toIso = (date: string, hm: string) => (date && /^\d{1,2}:\d{2}/.test(hm || "") ? new Date(`${date}T${hm.slice(0, 5)}:00`).toISOString() : "");
const h = (m: number) => (m / 60).toFixed(2);

type Doc = { id: string; type?: string; clientName?: string; data?: Record<string, unknown> };
function readDocs(): Doc[] { try { return JSON.parse(window.localStorage.getItem(DOCS_KEY) || "[]"); } catch { return []; } }

function weekSheets(input: { workers: Worker[]; docs: Doc[]; events: TapEvent[]; fixes: FixRequest[]; settings: TimesheetSettings; week: string; now: string }) {
  const clockTaps: TapEvent[] = readOwnerClockSafe().flatMap((c) => [
    { id: `clk-${c.id}-in`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "start_job" as const, at: c.started_at, docId: c.doc_id },
    ...(c.ended_at ? [{ id: `clk-${c.id}-out`, employeeId: c.employee_id, date: localYmd(c.started_at), kind: "end_shift" as const, at: c.ended_at, docId: c.doc_id }] : []),
  ]);
  const events = applyFixes([...input.events, ...clockTaps], input.fixes);
  const days = Array.from({ length: 7 }, (_, i) => addDays(input.week, i));
  const out = new Map<string, DaySheet>();
  for (const worker of input.workers) for (const date of days) {
    const schedule: ScheduledJob[] = input.docs.flatMap((doc) => {
      const s = readSchedule(doc.data);
      if (!s || s.date !== date || !s.workerIds.includes(worker.id)) return [];
      const start = toIso(s.date, s.startTime), end = toIso(s.date, s.endTime || "");
      return start && end ? [{ docId: doc.id, start, end, label: String(doc.data?.invoiceNumber || doc.clientName || "Job") }] : [];
    });
    const mine = events.filter((e) => e.employeeId === worker.id && e.date === date);
    const coords = new Map(mine.filter((e) => e.lat != null && e.docId).map((e) => [e.docId!, { lat: e.lat!, lng: e.lng! }]));
    const sheet = buildDay({ employeeId: worker.id, date, events: mine, schedule, settings: input.settings, now: input.now,
      expectedDriveMinutes: (a, b) => { const p = a && coords.get(a), q = b && coords.get(b); return p && q ? estimateDriveMinutes(p, q) : undefined; } });
    if (input.fixes.some((f) => f.employeeId === worker.id && f.date === date && f.status === "pending")) sheet.flags.push("fix_requested");
    out.set(`${worker.id}|${date}`, sheet);
  }
  return { days, sheets: out };
}
function readOwnerClockSafe() { try { return readOwnerClock(); } catch { return []; } }

export default function TimesheetPage() {
  const [week, setWeek] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [approvals, setApprovals] = useState<DayApproval[]>([]);
  const [settings, setSettings] = useState<TimesheetSettings>(() => ({ gapMinutes: 60, transitTimeoutMinutes: 120, halfDayHours: 4 }));
  const [undo, setUndo] = useState<DayApproval[] | null>(null);
  const [editing, setEditing] = useState<{ key: string; hours: string } | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState("");
  useEffect(() => { const q = new URLSearchParams(window.location.search).get("date"); setWeek(weekOf(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localYmd(new Date().toISOString()))); setWorkers(readWorkers()); setDocs(readDocs()); setSettings(readLocalTimesheetSettings()); setNow(new Date().toISOString()); }, []);
  useEffect(() => {
    if (!week) return;
    void loadOwnerTimesheet(week, addDays(week, 6)).then((data) => { setEvents(data.events); setFixes(data.fixes); setApprovals(data.approvals); setSettings(data.settings); });
  }, [week]);
  const { days, sheets } = useMemo(() => (week && now ? weekSheets({ workers, docs, events, fixes, settings, week, now }) : { days: [] as string[], sheets: new Map<string, DaySheet>() }), [workers, docs, events, fixes, settings, week, now]);
  const approvalOf = (id: string, date: string) => approvals.find((a) => a.employeeId === id && a.date === date);
  const minutesOf = (id: string, date: string) => { const a = approvalOf(id, date); const s = sheets.get(`${id}|${date}`); return a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : s?.paidMinutes || 0; };

  async function commit(rows: DayApproval[], before: DayApproval[]) {
    const keys = new Set(rows.map((r) => `${r.employeeId}|${r.date}`));
    setApprovals((list) => [...list.filter((a) => !keys.has(`${a.employeeId}|${a.date}`)), ...rows]);
    await saveApprovals(rows);
    setUndo(before);
  }
  async function approveAll() {
    const rows: DayApproval[] = [], before: DayApproval[] = [];
    for (const w of workers) for (const date of days) {
      const s = sheets.get(`${w.id}|${date}`); const prev = approvalOf(w.id, date);
      if (!s || (!s.paidMinutes && prev?.editedMinutes == null) || prev?.approvedAt) continue;
      before.push(prev || { employeeId: w.id, date, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: null });
      rows.push({ employeeId: w.id, date, paidMinutes: prev?.editedMinutes ?? s.paidMinutes, driveMinutes: s.driveMinutes, editedMinutes: prev?.editedMinutes ?? null, approvedAt: new Date().toISOString() });
    }
    if (!rows.length) { setMessage("Nothing new to approve this week."); return; }
    await commit(rows, before);
    setMessage(`Approved ${rows.length} day${rows.length === 1 ? "" : "s"}.`);
  }
  async function undoLast() { if (!undo) return; await commit(undo, []); setUndo(null); setMessage("Undone."); }
  async function saveEdit() {
    if (!editing) return;
    const [id, date] = editing.key.split("|");
    const mins = Math.max(0, Number(editing.hours) * 60 || 0);
    const prev = approvalOf(id, date); const s = sheets.get(editing.key);
    await commit([{ employeeId: id, date, paidMinutes: mins, driveMinutes: s?.driveMinutes || 0, editedMinutes: mins, approvedAt: prev?.approvedAt ?? null }], [prev || { employeeId: id, date, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: null }]);
    setEditing(null);
  }
  async function decide(fix: FixRequest, status: "approved" | "denied") {
    const error = await decideFix(fix.id, status);
    if (error) { setMessage(error); return; }
    setFixes((list) => list.map((f) => (f.id === fix.id ? { ...f, status, decidedAt: new Date().toISOString() } : f)));
  }

  return (
    <AppShell title="Timesheet">
      <PageHeader title="Weekly timesheet" subtitle="Paid day = first job start to last job end. Short gaps count as drive time; long gaps are unpaid. Missing taps fill from the schedule." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, -7))} data-testid="ts-prev">‹ Prev</button>
        <span className="font-semibold" data-testid="ts-week">Week of {week}</span>
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, 7))} data-testid="ts-next">Next ›</button>
        <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white" data-testid="ts-approve-all" onClick={approveAll}>Approve all</button>
        {undo && <button className="min-h-11 rounded-lg border px-3" data-testid="ts-undo" onClick={undoLast}>Undo</button>}
        {message && <span role="status" data-testid="ts-message" className="text-sm">{message}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm" data-testid="ts-table">
          <thead><tr><th className="p-2 text-left">Worker</th>{days.map((d) => <th key={d} className="p-2 text-left">{new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" })}</th>)}<th className="p-2 text-right">Week</th></tr></thead>
          <tbody>
            {workers.map((w) => {
              const pay = readPaySettings(w.paySettings);
              const wk = weekPay(days.map((date) => { const s = sheets.get(`${w.id}|${date}`); const total = minutesOf(w.id, date); const drive = Math.min(total, s?.driveMinutes || 0); return { date, workMinutes: total - drive, driveMinutes: drive }; }), pay, w.rate || "");
              const total = days.reduce((sum, d) => sum + minutesOf(w.id, d), 0);
              return (
                <tr key={w.id} className="border-t align-top" data-testid={`ts-row-${w.id}`}>
                  <td className="p-2 font-semibold">{w.name}</td>
                  {days.map((date) => {
                    const key = `${w.id}|${date}`; const s = sheets.get(key); const a = approvalOf(w.id, date); const mins = minutesOf(w.id, date);
                    const flags = [...(s?.flags || []), ...(a?.editedMinutes != null ? ["edited"] : [])];
                    return (
                      <td key={date} className="p-2" data-testid={`ts-cell-${w.id}-${date}`}>
                        {editing?.key === key ? (
                          <span className="flex gap-1"><input aria-label="Paid hours" data-testid="ts-edit-hours" className="w-16 rounded border px-1" inputMode="decimal" value={editing.hours} onChange={(e) => setEditing({ key, hours: e.target.value })} /><button className="underline" data-testid="ts-edit-save" onClick={saveEdit}>Save</button></span>
                        ) : (
                          <button className="text-left" onClick={() => setEditing({ key, hours: h(mins) })} data-testid="ts-edit">
                            <b className="tabular-nums">{mins ? `${h(mins)} h` : "—"}</b>
                            {s?.driveMinutes ? <span className="block text-xs">{Math.round(s.driveMinutes)} min drive</span> : null}
                            {a?.approvedAt && <span className="block text-xs text-emerald-600" data-testid="ts-approved">Approved</span>}
                          </button>
                        )}
                        {flags.map((f) => <span key={f} className="mr-1 mt-1 inline-block rounded bg-amber-500/15 px-1 text-[11px]" data-testid={`ts-flag-${f}`}>{FLAG_LABEL[f] || f}</span>)}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right tabular-nums" data-testid={`ts-week-${w.id}`}>{h(total)} h<span className="block text-xs">${wk.total.toFixed(2)}{wk.premium ? ` incl. OT $${wk.premium.toFixed(2)}` : ""}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {fixes.length > 0 && (
        <section className="mt-4 space-y-2" data-testid="ts-fixes">
          <h2 className="font-bold">Fix-my-time requests</h2>
          {fixes.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span>{workers.find((w) => w.id === f.employeeId)?.name || "Worker"} · {f.date} · {f.kind.replace("_", " ")} → {new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · “{f.reason}”</span>
              {f.status === "pending" ? (<><button className="min-h-9 rounded bg-teal-600 px-3 text-white" data-testid="ts-fix-approve" onClick={() => decide(f, "approved")}>Approve</button><button className="min-h-9 rounded border px-3" data-testid="ts-fix-deny" onClick={() => decide(f, "denied")}>Deny</button></>) : <span className="text-xs">{f.status}{f.decidedAt ? ` ${f.decidedAt.slice(0, 10)}` : ""}</span>}
            </div>
          ))}
        </section>
      )}
      <details className="mt-4 rounded-lg border p-3 text-sm" data-testid="ts-settings">
        <summary className="font-semibold">Timesheet rules</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label>Unpaid gap over (min)<input data-testid="ts-gap" className="mt-1 block min-h-11 w-full rounded border px-2" inputMode="numeric" value={settings.gapMinutes} onChange={(e) => setSettings({ ...settings, gapMinutes: Number(e.target.value) || 0 })} /></label>
          <label>“Still driving?” after (min)<input className="mt-1 block min-h-11 w-full rounded border px-2" inputMode="numeric" value={settings.transitTimeoutMinutes} onChange={(e) => setSettings({ ...settings, transitTimeoutMinutes: Number(e.target.value) || 0 })} /></label>
          <label>Half day under (h)<input className="mt-1 block min-h-11 w-full rounded border px-2" inputMode="decimal" value={settings.halfDayHours} onChange={(e) => setSettings({ ...settings, halfDayHours: Number(e.target.value) || 0 })} /></label>
        </div>
        <button className="mt-2 min-h-11 rounded-lg border px-3" data-testid="ts-settings-save" onClick={() => { void saveTimesheetSettings(settings); setMessage("Rules saved."); }}>Save rules</button>
      </details>
    </AppShell>
  );
}
