"use client";
/**
 * Owner weekly timesheet: every worker, each day's paid hours (day engine), drive time and flags,
 * tap a day for its timeline + fixes (DayDetail), Approve all ready / Approve week with Undo. Rules live on Team (TimesheetRules).
 * Old clock entries count as taps (clock in = Start job, clock out = End shift), so nothing recorded is lost.
 * Pay comes from the APPROVED day (from the cutover date on): approving or undoing here rewrites each job's share of
 * the day on its crew rows, so job labor/profit, Crew pay, Year packet and Reports follow. Unapproved days are estimates.
 */
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { readWorkers, type Worker } from "@/lib/schedule";
import { weekOf } from "@/lib/pay-types";
import Link from "next/link";
import DayDetail from "@/components/timesheet/DayDetail";
import { decideFix, loadOwnerTimesheet, readLocalTimesheetSettings, saveApprovals, type DayApproval } from "@/lib/day-events";
import { needsReview, weekStatus, type DaySheet, type FixRequest, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";
import { addDays, applyWeekToDocs, pushChangedDocs, readDocs, syncTimesheetCutover, scheduleFor, weekShares, weekSheets } from "@/lib/timesheet-sync";
import type { DayPay } from "@/lib/timesheet-pay";

const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const h = (m: number) => (m / 60).toFixed(2);

export default function TimesheetPage() {
  const [week, setWeek] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [docs, setDocs] = useState<ReturnType<typeof readDocs>>([]);
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [approvals, setApprovals] = useState<DayApproval[]>([]);
  const [settings, setSettings] = useState<TimesheetSettings>(() => ({ gapMinutes: 60, transitTimeoutMinutes: 120, halfDayHours: 4 }));
  // Undo history per week (newest last, up to 20 steps): each step is the approvals as they were before it.
  const [history, setHistory] = useState<Record<string, DayApproval[][]>>({});
  const undoSteps = history[week] || [];
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [phone, setPhone] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { const mq = window.matchMedia("(max-width: 639px)"); const on = () => setPhone(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState("");
  const [cutover, setCutover] = useState("");
  // Browser-only data, loaded once after the owner's shared pay cutover is synced (async, so no setState during the effect).
  useEffect(() => {
    let live = true;
    void syncTimesheetCutover().then((day) => {
      if (!live) return;
      const q = new URLSearchParams(window.location.search).get("date");
      setCutover(day);
      setWeek(weekOf(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localYmd(new Date().toISOString())));
      setWorkers(readWorkers()); setDocs(readDocs()); setSettings(readLocalTimesheetSettings()); setNow(new Date().toISOString());
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!week) return;
    void loadOwnerTimesheet(week, addDays(week, 6)).then((data) => { setEvents(data.events); setFixes(data.fixes); setApprovals(data.approvals); setSettings(data.settings); });
  }, [week]);
  const { days, sheets } = useMemo(() => (week && now ? weekSheets({ workers, docs, events, fixes, settings, week, now }) : { days: [] as string[], sheets: new Map<string, DaySheet>() }), [workers, docs, events, fixes, settings, week, now]);
  const { pays, shares } = useMemo(() => weekShares({ workers, docs, days, sheets, approvals, settings }), [workers, docs, days, sheets, approvals, settings]);
  // Keep the jobs in step with the week (estimates for unapproved days, the approved day's split otherwise).
  useEffect(() => {
    if (!week || !now || !cutover || !shares.size) return;
    const res = applyWeekToDocs(readDocs(), shares, cutover);
    if (res.changed.length) void pushChangedDocs(res.changed);
  }, [shares, week, now, cutover]);
  const approvalOf = (id: string, date: string) => approvals.find((a) => a.employeeId === id && a.date === date);
  const minutesOf = (id: string, date: string) => { const a = approvalOf(id, date); const s = sheets.get(`${id}|${date}`); return a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : s?.paidMinutes || 0; };

  async function commit(rows: DayApproval[], before: DayApproval[], record = true) {
    const keys = new Set(rows.map((r) => `${r.employeeId}|${r.date}`));
    setApprovals((list) => [...list.filter((a) => !keys.has(`${a.employeeId}|${a.date}`)), ...rows]);
    if (record && before.length) setHistory((all) => ({ ...all, [week]: [...(all[week] || []), before].slice(-20) }));
    await saveApprovals(rows);
  }
  const blank = (employeeId: string, date: string): DayApproval => ({ employeeId, date, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: null, changedAt: null });
  const flagsOf = (id: string, date: string) => { const s = sheets.get(`${id}|${date}`); const a = approvalOf(id, date); return [...(s?.flags || []), ...(a?.editedMinutes != null ? ["edited"] : []), ...(a?.changedAt && !a?.approvedAt ? ["changed_since_approved"] : [])]; };
  const dayInfo = (id: string, date: string) => { const a = approvalOf(id, date); const mins = minutesOf(id, date); return { mins, approved: Boolean(a?.approvedAt), flagged: needsReview(sheets.get(`${id}|${date}`)?.flags || [], a?.editedMinutes != null), hasHours: mins > 0 }; };
  const approvedRow = (id: string, date: string, prev?: DayApproval): DayApproval => { const s = sheets.get(`${id}|${date}`); return { employeeId: id, date, paidMinutes: prev?.editedMinutes ?? s?.paidMinutes ?? 0, driveMinutes: s?.driveMinutes || 0, editedMinutes: prev?.editedMinutes ?? null, approvedAt: new Date().toISOString(), changedAt: null }; };
  /** Approve days with hours that aren't approved yet; `onlyReady` skips flagged days. */
  async function approveDays(ids: string[], onlyReady: boolean) {
    const rows: DayApproval[] = [], before: DayApproval[] = []; let skipped = 0;
    for (const id of ids) for (const date of days) {
      const d = dayInfo(id, date); const prev = approvalOf(id, date);
      if (!d.hasHours || d.approved) continue;
      if (onlyReady && d.flagged) { skipped++; continue; }
      before.push(prev || blank(id, date)); rows.push(approvedRow(id, date, prev));
    }
    const skip = skipped ? ` Skipped ${skipped} day${skipped === 1 ? "" : "s"} that need${skipped === 1 ? "s" : ""} review.` : "";
    if (!rows.length) { setMessage(`Nothing ready to approve this week.${skip}`); return; }
    await commit(rows, before);
    setMessage(`Approved ${rows.length} day${rows.length === 1 ? "" : "s"}.${skip}`);
  }
  async function unapproveWeek(id: string) {
    const rows: DayApproval[] = [], before: DayApproval[] = [];
    for (const date of days) { const prev = approvalOf(id, date); if (!prev?.approvedAt) continue; before.push(prev); rows.push({ ...prev, approvedAt: null }); }
    if (rows.length) { await commit(rows, before); setMessage(`Unapproved ${rows.length} day${rows.length === 1 ? "" : "s"}.`); }
  }
  async function approveDay(id: string, date: string) { const prev = approvalOf(id, date); await commit([approvedRow(id, date, prev)], [prev || blank(id, date)]); setMessage("Approved 1 day."); }
  async function unapproveDay(id: string, date: string) { const prev = approvalOf(id, date); if (prev?.approvedAt) await commit([{ ...prev, approvedAt: null }], [prev]); }
  async function undoLast() {
    const step = undoSteps[undoSteps.length - 1];
    if (!step) return;
    setHistory((all) => ({ ...all, [week]: (all[week] || []).slice(0, -1) }));
    await commit(step, [], false);
    setMessage(`Undone. ${undoSteps.length - 1} more step${undoSteps.length - 1 === 1 ? "" : "s"} to undo.`);
  }
  async function setMinutes(id: string, date: string, mins: number, approve: boolean) {
    const prev = approvalOf(id, date); const s = sheets.get(`${id}|${date}`);
    // Editing an approved day clears its approval: pay goes back to the estimate until approved again.
    const wasApproved = Boolean(prev?.approvedAt) || Boolean(prev?.changedAt);
    const at = new Date().toISOString();
    await commit([{ employeeId: id, date, paidMinutes: mins, driveMinutes: s?.driveMinutes || 0, editedMinutes: mins, approvedAt: approve ? at : null, changedAt: approve ? null : wasApproved ? at : null }], [prev || blank(id, date)]);
    setMessage(approve ? "Used the schedule and approved." : prev?.approvedAt ? "Changed since approved, approve again." : "Hours saved.");
  }
  async function decide(fix: FixRequest, status: "approved" | "denied") {
    const error = await decideFix(fix.id, status);
    if (error) { setMessage(error); return; }
    setFixes((list) => list.map((f) => (f.id === fix.id ? { ...f, status, decidedAt: new Date().toISOString() } : f)));
    // An approved fix changes that day: clear its approval so the owner approves the new hours.
    const prev = approvalOf(fix.employeeId, fix.date);
    if (status === "approved" && prev?.approvedAt) {
      await commit([{ ...prev, approvedAt: null, changedAt: new Date().toISOString() }], [prev]);
      setMessage("Changed since approved, approve again.");
    }
  }

  const rows = workers.map((w) => {
    const info = days.map((date) => ({ date, ...dayInfo(w.id, date) }));
    const status = weekStatus(info);
    const wkDays: DayPay[] = pays.get(w.id) || [];
    const cents = wkDays.reduce((sum, d) => sum + d.cents, 0);
    const total = info.reduce((sum, d) => sum + d.mins, 0);
    const estimated = wkDays.some((d) => !d.approved && d.cents);
    return { w, info, status, cents, total, estimated, unallocated: wkDays.some((d) => d.unallocated) };
  });
  const shown = rows.filter((r) => filter === "all" || r.status.kind === "review");
  const readyCount = rows.reduce((n, r) => n + r.status.ready, 0);
  const reviewCount = rows.reduce((n, r) => n + r.status.review, 0);
  const openWorker = open ? workers.find((w) => w.id === open.split("|")[0]) : undefined;
  const openDate = open?.split("|")[1] || "";
  const badgeClass = (k: string) => k === "review" ? "bg-amber-500/20 text-amber-800" : k === "ready" ? "bg-teal-500/15 text-teal-800" : k === "approved" ? "bg-emerald-500/15 text-emerald-700" : "bg-gray-500/10 text-[var(--cr-muted)]";

  const cell = (id: string, d: { date: string; mins: number; approved: boolean; flagged: boolean }, wide = true) => {
    const s = sheets.get(`${id}|${d.date}`); const edited = approvalOf(id, d.date)?.editedMinutes != null;
    return (
      <button type="button" className="group relative w-full rounded-lg p-2 text-left hover:bg-teal-500/10 focus:bg-teal-500/10" onClick={() => setOpen(`${id}|${d.date}`)} data-testid="ts-edit" aria-label={`${d.mins ? `${h(d.mins)} hours` : "Add hours"}, ${d.date}`}>
        {d.mins ? (
          <>
            <b className={`tabular-nums ${wide ? "text-base" : ""}`}>{h(d.mins)} h</b>
            {d.approved && <span className="ml-1 text-emerald-600" title="Approved" data-testid="ts-approved">✓</span>}
            {d.flagged && !d.approved && <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white" title="Needs review" data-testid="ts-flag-alert">!</span>}
            {edited && <span className="ml-1 text-[11px] text-[var(--cr-muted)]" data-testid="ts-edited">edited</span>}
            {s?.driveMinutes ? <span className="block text-xs text-[var(--cr-muted)]">incl. {Math.round(s.driveMinutes)} min drive</span> : null}
          </>
        ) : <span className="text-gray-400" data-testid="ts-add">+ Add</span>}
        <span aria-hidden="true" className="absolute right-1 top-1 text-xs text-[var(--cr-muted)] opacity-0 group-hover:opacity-100 group-focus:opacity-100">✎</span>
      </button>
    );
  };
  const weekEnd = (r: (typeof rows)[number]) => (
    <div className="space-y-1 text-right" data-testid={`ts-week-${r.w.id}`}>
      <div className="font-semibold tabular-nums">{h(r.total)} h</div>
      <div className="text-xs tabular-nums" data-testid={`ts-week-pay-${r.w.id}`}>${(r.cents / 100).toFixed(2)}{r.estimated ? " estimated" : ""}</div>
      {r.unallocated && <div className="text-xs" data-testid={`ts-unallocated-${r.w.id}`}>Salary, no jobs this week (unallocated labor)</div>}
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(r.status.kind)}`} data-testid={`ts-status-${r.w.id}`}>{r.status.label}</span>
      <div>
        {r.status.kind === "approved"
          ? <button className="min-h-9 rounded border px-2 text-xs" data-testid={`ts-unapprove-week-${r.w.id}`} onClick={() => unapproveWeek(r.w.id)}>Unapprove</button>
          : r.status.kind !== "none" && <button className="min-h-9 rounded bg-teal-600 px-2 text-xs font-semibold text-white" data-testid={`ts-approve-week-${r.w.id}`} onClick={() => approveDays([r.w.id], false)}>Approve week</button>}
      </div>
    </div>
  );
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" });

  return (
    <AppShell title="Timesheet">
      <PageHeader title="Weekly timesheet" subtitle="Tap any day to see its timeline, fix it or approve it." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, -7))} data-testid="ts-prev" aria-label="Previous week">‹</button>
        <span className="font-semibold" data-testid="ts-week">Week of {week}</span>
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, 7))} data-testid="ts-next" aria-label="Next week">›</button>
        <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Show">
          <button className={`min-h-11 px-3 ${filter === "all" ? "bg-teal-600 text-white" : ""}`} data-testid="ts-filter-all" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button className={`min-h-11 px-3 ${filter === "review" ? "bg-teal-600 text-white" : ""}`} data-testid="ts-filter-review" aria-pressed={filter === "review"} onClick={() => setFilter("review")}>Needs review only{reviewCount ? ` (${reviewCount})` : ""}</button>
        </div>
        <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white" data-testid="ts-approve-all" onClick={() => approveDays(workers.map((w) => w.id), true)}>Approve all ready ({readyCount})</button>
        {undoSteps.length > 0 && <button className="min-h-11 rounded-lg border px-3" data-testid="ts-undo" onClick={undoLast}>Undo ({undoSteps.length})</button>}
        <Link href="/help?a=timesheet-how-counted" className="text-sm underline" data-testid="ts-how">How hours are counted</Link>
      </div>
      {message && <p role="status" data-testid="ts-message" className="mb-2 text-sm">{message}</p>}
      {phone ? (
        <div className="space-y-2" data-testid="ts-cards">
          {shown.map((r) => (
            <div key={r.w.id} className="rounded-xl border p-3" data-testid={`ts-row-${r.w.id}`}>
              <button className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={expanded === r.w.id} data-testid={`ts-card-toggle-${r.w.id}`} onClick={() => setExpanded(expanded === r.w.id ? null : r.w.id)}>
                <span className="font-semibold">{r.w.name}<span className="block text-xs font-normal text-[var(--cr-muted)]">{expanded === r.w.id ? "Hide days ▲" : "Show days ▼"}</span></span>
              </button>
              {weekEnd(r)}
              {expanded === r.w.id && (
                <div className="mt-2 divide-y">
                  {r.info.map((d) => <div key={d.date} className="flex items-center gap-2" data-testid={`ts-cell-${r.w.id}-${d.date}`}><span className="w-16 text-xs">{dayLabel(d.date)}</span>{cell(r.w.id, d, false)}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm" data-testid="ts-table">
            <thead><tr><th className="p-2 text-left">Worker</th>{days.map((d) => <th key={d} className="p-2 text-left">{dayLabel(d)}</th>)}<th className="p-2 text-right">Week</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.w.id} className="border-t align-top" data-testid={`ts-row-${r.w.id}`}>
                  <td className="p-2 font-semibold">{r.w.name}</td>
                  {r.info.map((d) => <td key={d.date} className="p-1" data-testid={`ts-cell-${r.w.id}-${d.date}`}>{cell(r.w.id, d)}</td>)}
                  <td className="p-2">{weekEnd(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!shown.length && <p className="mt-2 text-sm text-[var(--cr-muted)]" data-testid="ts-empty">{filter === "review" ? "Nothing needs review this week." : "No crew yet."}</p>}
      {fixes.some((f) => f.status === "pending") && (
        <section className="mt-4 space-y-2" data-testid="ts-fixes">
          <h2 className="font-bold">Fix-my-time requests</h2>
          {fixes.filter((f) => f.status === "pending").map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span>{workers.find((w) => w.id === f.employeeId)?.name || "Worker"} · {f.date} · {f.kind.replace("_", " ")} → {new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · “{f.reason}”</span>
              <button className="min-h-9 rounded bg-teal-600 px-3 text-white" data-testid="ts-fix-approve" onClick={() => decide(f, "approved")}>Approve</button>
              <button className="min-h-9 rounded border px-3" data-testid="ts-fix-deny" onClick={() => decide(f, "denied")}>Deny</button>
            </div>
          ))}
        </section>
      )}
      <p className="mt-4 text-xs text-[var(--cr-muted)]">Rules (gap, “Still driving?”, half day) are on <Link href="/employees" className="underline">Team</Link> under Timesheet rules.</p>
      {open && openWorker && (
        <DayDetail key={`${open}|${approvalOf(openWorker.id, openDate)?.editedMinutes ?? ""}`} workerName={openWorker.name} date={openDate} sheet={sheets.get(open)} approval={approvalOf(openWorker.id, openDate)}
          minutes={minutesOf(openWorker.id, openDate)} extraFlags={flagsOf(openWorker.id, openDate).filter((f) => f === "edited" || f === "changed_since_approved")}
          settings={settings} schedule={scheduleFor(docs, openWorker.id, openDate)} fixes={fixes.filter((f) => f.employeeId === openWorker.id && f.date === openDate)}
          onApprove={() => approveDay(openWorker.id, openDate)} onUnapprove={() => unapproveDay(openWorker.id, openDate)}
          onSetMinutes={(m, approve) => setMinutes(openWorker.id, openDate, m, approve)} onDecide={(f, st) => decide(f, st)} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}
