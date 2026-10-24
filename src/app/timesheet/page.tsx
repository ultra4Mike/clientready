"use client";
/**
 * Owner weekly timesheet: every worker, each day's paid hours (day engine), drive time and flags,
 * tap a day for its timeline + fixes (DayDetail), Approve all ready / Approve week with Undo. Rules live on Team (TimesheetRules).
 * Old clock entries count as taps (clock in = Start job, clock out = End shift), so nothing recorded is lost.
 * Pay comes from the APPROVED day (from the cutover date on): approving or undoing here rewrites each job's share of
 * the day on its crew rows, so job labor/profit, Crew pay, Year packet and Reports follow. Unapproved days are estimates.
 */
import { fmtTime, ymdTz, readWorkerOverrides, timeAlerts, payPeriodOf, type ScheduledJob } from "@/lib/timesheet";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { readWorkers, type Worker } from "@/lib/schedule";
import { weekOf } from "@/lib/pay-types";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { refreshEmployeesCache } from "@/lib/account-cache";
import { splitAlerts, mergeApprovals, resolvedInPeriod, scheduleAlertLabel, pendingSurfaces, statusChip, LOADING_LABEL, type OwnerAlert } from "@/lib/timesheet-alerts";
import { timesheetEmptyKind, type CrewLoad } from "@/lib/timesheet-crew-state";
import DayDetail from "@/components/timesheet/DayDetail";
import PtoOwnerCard from "@/components/phase2/PtoOwnerCard";
import { loadPtoForRange, loadPtoRequests } from "@/lib/phase2-data";
import { ptoDays, ptoKindLabel, type PtoRequest } from "@/lib/pay-phase2";
import { loadBusinessTz, loadAttestations, decideFix, loadOwnerTimesheet, readLocalTimesheetSettings, readLocalApprovals, saveApprovals, type DayApproval } from "@/lib/day-events";
import { dayState, DEFAULT_TIMESHEET_SETTINGS, reviewDayInfo, weekStatus, type DayStateName, type DaySheet, type FixRequest, type TapEvent, type TimesheetSettings } from "@/lib/timesheet";
import { addDays, applyWeekToDocs, pushChangedDocs, readDocs, syncTimesheetCutover, scheduleFor, weekShares, weekSheets } from "@/lib/timesheet-sync";
import type { DayPay } from "@/lib/timesheet-pay";

// Day keys are business-zone dates (account time zone), the same keys the crew portal saves taps under.
const localYmd = (iso: string) => ymdTz(new Date(iso));
const h = (m: number) => (m / 60).toFixed(2);

export default function TimesheetPage() {
  const [week, setWeek] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [docs, setDocs] = useState<ReturnType<typeof readDocs>>([]);
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [fixes, setFixes] = useState<FixRequest[]>([]);
  const [approvals, setApprovals] = useState<DayApproval[]>([]);
  const [settings, setSettings] = useState<TimesheetSettings>(DEFAULT_TIMESHEET_SETTINGS);
  const [weekPto, setWeekPto] = useState<PtoRequest[] | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodPick, setPeriod] = useState<"" | "weekly" | "biweekly" | "semimonthly">("");
  const [attest, setAttest] = useState<Record<string, string>>({});
  const [fixNotes, setFixNotes] = useState<Record<string, string>>({});
  // Undo history per week (newest last, up to 20 steps): each step is the approvals as they were before it.
  const [history, setHistory] = useState<Record<string, DayApproval[][]>>({});
  const undoSteps = history[week] || [];
  const [open, setOpen] = useState<string | null>(null);
  // Help retest: the day dialog must never come back on its own after a reload / back-forward restore.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (["open", "day", "worker"].some((k) => url.searchParams.has(k))) {
      ["open", "day", "worker"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const close = (e: Event) => { if (e.type === "pagehide" || (e as PageTransitionEvent).persisted) setOpen(null); };
    window.addEventListener("pageshow", close);
    window.addEventListener("pagehide", close);
    return () => { window.removeEventListener("pageshow", close); window.removeEventListener("pagehide", close); };
  }, []);
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [phone, setPhone] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cloud, setCloud] = useState(true);
  const [cloudError, setCloudError] = useState("");
  useEffect(() => { const mq = window.matchMedia("(max-width: 639px)"); const on = () => setPhone(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState("");
  const [cutover, setCutover] = useState("");
  const [weekLoading, setWeekLoading] = useState(true);
  const [crewLoad, setCrewLoad] = useState<CrewLoad>("loading");
  // Browser-only data, loaded once after the owner's shared pay cutover is synced (async, so no setState during the effect).
  useEffect(() => {
    let live = true;
    // Render this device's copy right away; the zone, cutover and server reads fill in alongside (never one after another).
    const q = new URLSearchParams(window.location.search).get("date");
    const pickWeek = () => weekOf(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localYmd(new Date().toISOString()));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    if (new URLSearchParams(window.location.search).get("filter") === "review") setFilter("review");
    const first = pickWeek();
    setWeek(first); setWorkers(readWorkers()); setDocs(readDocs()); setSettings(readLocalTimesheetSettings()); setNow(new Date().toISOString());
    void loadBusinessTz().then(() => { if (live) { setWeek((w) => (w === first ? pickWeek() : w)); setNow(new Date().toISOString()); } });
    void syncTimesheetCutover().then((day) => { if (live) setCutover(day); });
    // The crew list is a browser cache filled by Team; a fresh browser/sign-in has none, so read it from the server here too.
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!live) return;
      if (!data.user) { setCrewLoad("signed_out"); return; }
      const ok = await refreshEmployeesCache(data.user.id).catch(() => false);
      if (!live) return;
      if (ok) setWorkers(readWorkers());
      setCrewLoad(ok ? "ready" : "error");
    }).catch(() => { if (live) setCrewLoad("error"); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!week) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    let live = true; setWeekLoading(true); setApprovals(mergeApprovals(readLocalApprovals(week, addDays(week, 6)), [...savedApprovals.current.values()].filter((a) => a.date >= week && a.date <= addDays(week, 6))));
    void loadOwnerTimesheet(week, addDays(week, 6)).then((data) => { if (!live) return; setWeekLoading(false); setCloud(data.cloud); setCloudError(data.cloudError || ""); setEvents(data.events); setFixes(data.fixes); setApprovals(mergeApprovals(data.approvals, [...savedApprovals.current.values()].filter((a) => a.date >= week && a.date <= addDays(week, 6)))); setSettings(data.settings); }).catch(() => { if (live) { setWeekLoading(false); setCloud(false); } });
    void loadPtoForRange(week, addDays(week, 6)).then((r) => { if (live) setWeekPto(r); }).catch(() => {});
    void loadAttestations(week).then((r) => { if (live) setAttest(r); });
    return () => { live = false; };
  }, [week]);
  const { days, sheets } = useMemo(() => (week && now ? weekSheets({ workers, docs, events, fixes, settings, week, now }) : { days: [] as string[], sheets: new Map<string, DaySheet>() }), [workers, docs, events, fixes, settings, week, now]);
  const offDays = useMemo(() => (week ? ptoDays(weekPto || [], workers as never, week, addDays(week, 6)) : new Map<string, { hours: number; kind: string }>()), [weekPto, workers, week]);
  const { pays, shares } = useMemo(() => (week && days.length ? weekShares({ workers, docs, days, sheets, approvals, settings, pto: weekPto }) : { pays: new Map<string, DayPay[]>(), shares: new Map() as ReturnType<typeof weekShares>["shares"] }), [workers, docs, days, sheets, approvals, settings, weekPto, week]);
  // Keep the jobs in step with the week (estimates for unapproved days, the approved day's split otherwise).
  useEffect(() => {
    if (!week || !now || !cutover || !shares.size || !cloud || weekLoading) return; // never push estimates built from a failed/empty cloud read
    const res = applyWeekToDocs(readDocs(), shares, cutover);
    if (res.changed.length) void pushChangedDocs(res.changed);
  }, [shares, week, now, cutover, cloud, weekLoading]);
  const approvalOf = (id: string, date: string) => approvals.find((a) => a.employeeId === id && a.date === date);
  const minutesOf = (id: string, date: string) => { const a = approvalOf(id, date); const s = sheets.get(`${id}|${date}`); return a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : s?.paidMinutes || 0; };

  const savedApprovals = useRef(new Map<string, DayApproval>()); // saved this session; a slower in-flight load can't undo them
  async function commit(rows: DayApproval[], before: DayApproval[], record = true, note = "") {
    const keys = new Set(rows.map((r) => `${r.employeeId}|${r.date}`));
    rows = rows.map((r) => (r.approvedAt ? { ...r, changedAt: null } : r)); // approved is never "changed since approved"
    setApprovals((list) => [...list.filter((a) => !keys.has(`${a.employeeId}|${a.date}`)), ...rows]);
    if (record && before.length) setHistory((all) => ({ ...all, [week]: [...(all[week] || []), before].slice(-20) }));
    const error = await saveApprovals(rows, note);
    if (error) {
      // Not saved: show what the server has, never a fake "Approved".
      setApprovals((list) => [...list.filter((a) => !keys.has(`${a.employeeId}|${a.date}`)), ...before]);
      setMessage(`Not saved: ${error}`);
      return false;
    }
    for (const r of rows) savedApprovals.current.set(`${r.employeeId}|${r.date}`, r);
    return true;
  }
  const blank = (employeeId: string, date: string): DayApproval => ({ employeeId, date, paidMinutes: 0, driveMinutes: 0, editedMinutes: null, approvedAt: null, changedAt: null });
  const flagsOf = (id: string, date: string) => { const s = sheets.get(`${id}|${date}`); const a = approvalOf(id, date); return [...(s?.flags || []), ...(a?.editedMinutes != null ? ["edited"] : []), ...(a?.changedAt && !a?.approvedAt ? ["changed_since_approved"] : [])]; };
  const dayInfo = (id: string, date: string) => reviewDayInfo(sheets.get(`${id}|${date}`), approvalOf(id, date));
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
    if (!(await commit(rows, before))) return;
    setMessage(`Approved ${rows.length} day${rows.length === 1 ? "" : "s"}.${skip}`);
  }
  async function unapproveWeek(id: string) {
    const rows: DayApproval[] = [], before: DayApproval[] = [];
    for (const date of days) { const prev = approvalOf(id, date); if (!prev?.approvedAt) continue; before.push(prev); rows.push({ ...prev, approvedAt: null }); }
    if (rows.length) { await commit(rows, before); setMessage(`Unapproved ${rows.length} day${rows.length === 1 ? "" : "s"}.`); }
  }
  async function approveDay(id: string, date: string) { const prev = approvalOf(id, date); if (await commit([approvedRow(id, date, prev)], [prev || blank(id, date)])) setMessage("Approved 1 day."); }
  async function unapproveDay(id: string, date: string) { const prev = approvalOf(id, date); if (prev?.approvedAt) await commit([{ ...prev, approvedAt: null }], [prev]); }
  async function undoLast() {
    const step = undoSteps[undoSteps.length - 1];
    if (!step) return;
    setHistory((all) => ({ ...all, [week]: (all[week] || []).slice(0, -1) }));
    if (!(await commit(step, [], false))) return;
    setMessage(`Undone. ${undoSteps.length - 1} more step${undoSteps.length - 1 === 1 ? "" : "s"} to undo.`);
  }
  async function setMinutes(id: string, date: string, mins: number, approve: boolean, note = "") {
    const prev = approvalOf(id, date); const s = sheets.get(`${id}|${date}`);
    // Editing an approved day clears its approval: pay goes back to the estimate until approved again.
    const wasApproved = Boolean(prev?.approvedAt) || Boolean(prev?.changedAt);
    const at = new Date().toISOString();
    if (!await commit([{ employeeId: id, date, paidMinutes: mins, driveMinutes: s?.driveMinutes || 0, editedMinutes: mins, approvedAt: approve ? at : null, changedAt: approve ? null : wasApproved ? at : null }], [prev || blank(id, date)], true, note)) return;
    setMessage(approve ? "Used the schedule and approved." : prev?.approvedAt ? "Changed since approved, approve again." : "Hours saved.");
  }
  async function decide(fix: FixRequest, status: "approved" | "denied", note = "") {
    const error = await decideFix(fix.id, status, note, fix);
    if (error) { setMessage(error); return; }
    setFixes((list) => list.map((f) => (f.id === fix.id ? { ...f, status, decidedAt: new Date().toISOString(), ...(note ? { ownerNote: note } : {}) } : f)));
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
  // Saved taps/approvals whose worker id is not on the Team list: never hidden silently.
  const known = new Set(workers.map((w) => w.id));
  const orphansAll = [...new Set([...events.map((e) => e.employeeId), ...approvals.filter((a) => a.approvedAt || a.editedMinutes != null).map((a) => a.employeeId)].filter((id) => id && !known.has(id)))];
  const shown = rows.filter((r) => filter === "all" || r.status.kind === "review");

  const openWorker = open ? workers.find((w) => w.id === open.split("|")[0]) : undefined;
  const openDate = open?.split("|")[1] || "";
  const badgeClass = (k: string) => k === "review" ? "bg-amber-500/20 text-amber-800" : k === "ready" ? "bg-teal-500/15 text-teal-800" : k === "approved" ? "bg-emerald-500/15 text-emerald-700" : "bg-gray-500/10 text-[var(--cr-muted)]";

  const payOf = (id: string, date: string) => (pays.get(id) || []).find((p) => p.date === date);
  // Who's on the clock right now (today's taps, this week only).
  const todayYmd = now ? localYmd(now) : "";
  const onClock = workers.map((w) => ({ w, st: dayState(events.filter((e) => e.employeeId === w.id && e.date === todayYmd)) })).filter((x) => x.st.state !== "OFF_DUTY");
  const stateWord: Record<DayStateName, string> = { OFF_DUTY: "Off", ON_DUTY_IDLE: "On duty", WORKING: "Working", IN_TRANSIT: "Driving", ON_BREAK: "On break" };
  const period = periodPick || settings.payPeriod;
  const pendingFixes = fixes.filter((f) => f.status === "pending");
  // Late start / no-show from the schedule (same engine rule the dashboard uses).
  const lateAlerts = useMemo(() => {
    if (!now) return [];
    const schedule = new Map<string, ScheduledJob[]>();
    for (const w of workers) for (const d of days) { const j = scheduleFor(docs, w.id, d); if (j.length) schedule.set(`${w.id}|${d}`, j); }
    return timeAlerts({ sheets, fixes: [], events, today: localYmd(now), schedule, now }).filter((a) => a.kind === "late_start" || a.kind === "no_show");
  }, [workers, days, docs, sheets, events, now]);
  const allAlerts: OwnerAlert[] = [
    ...lateAlerts.map((a) => ({ key: `${a.kind}-${a.employeeId}-${a.date}`, kind: a.kind, employeeId: a.employeeId, date: a.date, text: `${workers.find((w) => w.id === a.employeeId)?.name || "Worker"} · ${a.date}: ${scheduleAlertLabel(a.kind, minutesOf(a.employeeId, a.date))}`, open: `${a.employeeId}|${a.date}` })),
    ...pendingFixes.map((f) => ({ key: `fix-${f.id}`, sticky: true, text: `${workers.find((w) => w.id === f.employeeId)?.name || "Worker"} asked to fix ${f.date}`, open: `${f.employeeId}|${f.date}` })),
    ...rows.flatMap((r) => r.info.filter((d) => d.flagged && d.hasHours).map((d) => ({ key: `flag-${r.w.id}-${d.date}`, employeeId: r.w.id, date: d.date, text: `${r.w.name} · ${d.date} needs review`, open: `${r.w.id}|${d.date}` }))),
    ...events.filter((e) => e.outOfOrder || (e.deviceAt && Math.abs(new Date(e.deviceAt).getTime() - new Date(e.at).getTime()) > 300000)).map((e) => ({ key: `tap-${e.id}`, employeeId: e.employeeId, date: e.date, text: `${workers.find((w) => w.id === e.employeeId)?.name || "Worker"} · ${e.date}: ${e.outOfOrder ? "tap out of order" : "phone clock was off"}`, open: `${e.employeeId}|${e.date}` })),
  ];
  const split = splitAlerts(allAlerts, (id, date) => Boolean(approvalOf(id, date)?.approvedAt));
  // Until this week's approvals are read, an approved day would look open: show no alerts yet (the loading line shows).
  // pt437u: one gate for every pending surface; cached approvals are already applied (setApprovals above).
  const gate = pendingSurfaces(weekLoading || !now, {
    alerts: split.open,
    resolved: now ? resolvedInPeriod(split.resolved, payPeriodOf(localYmd(now), settings.payPeriod, settings.payPeriodAnchor || "")) : [],
    reviewCount: rows.reduce((n, r) => n + r.status.review, 0),
    readyCount: rows.reduce((n, r) => n + r.status.ready, 0),
    orphans: orphansAll,
  });
  const { alerts, resolved: resolvedAlerts, reviewCount, readyCount, orphans } = gate;
  async function exportCsv() {
    // Pay period: weekly = this week; biweekly = this + next week; semi-monthly = 1st–15th or 16th–end of the month of this week.
    const { from, to } = payPeriodOf(week, period, period === settings.payPeriod ? settings.payPeriodAnchor : "");
    const lines = ["Worker,Date,Paid hours,Drive min,Unpaid break min,Rounding min,OT hours,DT hours,Break premium hours,Units,Commission,Min-wage top-up,Prevailing-wage top-up,PTO hours,Holiday hours,PTO pay,Approved,Flags"];
    const ptoReqs = (await Promise.all([...new Set([from.slice(0, 4), to.slice(0, 4)])].map((y) => loadPtoRequests(y).catch(() => [])))).flat();
    const pto = ptoDays(ptoReqs, workers as never, from, to);
    const crewOn = (id: string, date: string) => docs.flatMap((d) => ((d.data as { crew?: { employeeId?: string; workDate?: string; units?: string; commissionPct?: string; commissionBase?: string }[] } | undefined)?.crew || []).filter((c) => c.employeeId === id && c.workDate === date));
    for (let wk = weekOf(from); wk <= to; wk = addDays(wk, 7)) {
      const data = await loadOwnerTimesheet(wk, addDays(wk, 6));
      const ws = weekSheets({ workers, docs, events: data.events, fixes: data.fixes, settings: data.settings, week: wk, now: new Date().toISOString() });
      const sh = weekShares({ workers, docs, days: ws.days, sheets: ws.sheets, approvals: data.approvals, settings: data.settings, pto: await loadPtoForRange(wk, addDays(wk, 6)) });
      for (const w of workers) for (const date of ws.days) {
        if (date < from || date > to) continue;
        const s = ws.sheets.get(`${w.id}|${date}`); const a = data.approvals.find((x) => x.employeeId === w.id && x.date === date);
        const mins = a?.editedMinutes != null ? a.editedMinutes : a?.approvedAt ? a.paidMinutes : s?.paidMinutes || 0;
        const off = pto.get(`${w.id}|${date}`);
        if (!mins && !off) continue;
        const p = (sh.pays.get(w.id) || []).find((x) => x.date === date);
        const cr = crewOn(w.id, date);
        const units = cr.reduce((t, c) => t + (Number(c.units) || 0), 0);
        const comm = cr.reduce((t, c) => t + ((Number(c.commissionPct) || 0) / 100) * (Number(c.commissionBase) || 0), 0);
        lines.push([`"${w.name.replace(/"/g, '""')}"`, date, (mins / 60).toFixed(2), Math.round(s?.driveMinutes || 0), s?.breakMinutes || 0, s?.roundingMinutes || 0, (p?.otHours || 0).toFixed(2), (p?.dtHours || 0).toFixed(2), s?.premiumHours || 0, units || "", comm ? comm.toFixed(2) : "", p?.topUpCents ? (p.topUpCents / 100).toFixed(2) : "", p?.prevailingTopUpCents ? (p.prevailingTopUpCents / 100).toFixed(2) : "", off ? (off.hours - off.holidayHours).toFixed(2) : "", off ? off.holidayHours.toFixed(2) : "", off ? (off.cents / 100).toFixed(2) : "", a?.approvedAt ? "yes" : "no", `"${(s?.flags || []).join(" ")}"`].join(","));
      }
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `hours-${from}-to-${to}.csv`; link.click(); URL.revokeObjectURL(url);
    setMessage(`Exported hours ${from} to ${to}.`);
  }
  const cell = (id: string, d: { date: string; mins: number; approved: boolean; flagged: boolean }, wide = true) => {
    const off = offDays.get(`${id}|${d.date}`);
    // Retest bug 2: approved PTO / sick / holiday shows in its day, worked hours or not.
    const offPill = off ? <span className={`cr-chip2 ${off.kind === "holiday" ? "cr-tone-good" : ""} ml-1 text-[11px]`} data-testid="ts-pill-off" data-kind={off.kind}>{ptoKindLabel(off.kind)} {off.hours} h</span> : null;
    const s = sheets.get(`${id}|${d.date}`); const edited = approvalOf(id, d.date)?.editedMinutes != null;
    return (
      <button type="button" data-state={d.approved ? "locked" : d.flagged ? "review" : "open"} className="group relative w-full rounded-lg p-2 text-left hover:bg-teal-500/10 focus:bg-teal-500/10" onClick={() => setOpen(`${id}|${d.date}`)} data-testid="ts-edit" aria-label={`${d.mins ? `${h(d.mins)} hours` : "Add hours"}, ${d.date}`}>
        {d.mins ? (
          <>
            <b className={`tabular-nums ${wide ? "text-base" : ""}`}>{h(d.mins)} h</b>
            {d.approved && <span className="ml-1 text-emerald-600" title="Approved" data-testid="ts-approved">✓</span>}
            {!gate.loading && d.flagged && !d.approved && <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white" title="Needs review" data-testid="ts-flag-alert">!</span>}
            {edited && <span className="cr-chip2 ml-1 text-[11px]" data-testid="ts-edited">edited</span>}
            {payOf(id, d.date)?.otHours ? <span className="cr-chip2 cr-tone-warn ml-1 text-[11px]" data-testid="ts-pill-ot">OT</span> : null}
            {payOf(id, d.date)?.dtHours ? <span className="cr-chip2 cr-tone-bad ml-1 text-[11px]" data-testid="ts-pill-dt">DT</span> : null}
            {s?.flags.some((f) => f === "meal_missed" || f === "rest_missed") ? <span className="cr-chip2 cr-tone-bad ml-1 text-[11px]" data-testid="ts-pill-break">Break</span> : null}
            {s?.flags.includes("before_hire") ? <span className="cr-chip2 cr-tone-warn ml-1 text-[11px]" data-testid="ts-pill-before-hire">Before hire</span> : null}
            {offPill}
            {s?.driveMinutes ? <span className="block text-xs text-[var(--cr-muted)]">incl. {Math.round(s.driveMinutes)} min drive</span> : null}
          </>
        ) : <>{off ? offPill : <span className="text-gray-400" data-testid="ts-add">+ Add</span>}</>}
        <span aria-hidden="true" className="absolute right-1 top-1 text-xs text-[var(--cr-muted)] opacity-0 group-hover:opacity-100 group-focus:opacity-100">✎</span>
      </button>
    );
  };
  const weekEnd = (r: (typeof rows)[number]) => (
    <div className="space-y-1 text-right" data-testid={`ts-week-${r.w.id}`}>
      <div className="font-semibold tabular-nums">{h(r.total)} h</div>
      <div className="text-xs tabular-nums" data-testid={`ts-week-pay-${r.w.id}`}>${(r.cents / 100).toFixed(2)}{r.estimated ? " estimated" : ""}</div>
      {r.unallocated && <div className="text-xs" data-testid={`ts-unallocated-${r.w.id}`}>Salary, no jobs this week (unallocated labor)</div>}
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass(statusChip(gate.loading, r.status).kind)}`} data-testid={`ts-status-${r.w.id}`} data-loading={gate.loading || undefined}>{statusChip(gate.loading, r.status).label}</span>
      <div>
        {gate.loading ? null : r.status.kind === "approved"
          ? <button className="min-h-9 rounded border px-2 text-xs" data-testid={`ts-unapprove-week-${r.w.id}`} onClick={() => unapproveWeek(r.w.id)}>Unapprove</button>
          : r.status.kind !== "none" && <button className="min-h-9 rounded bg-teal-600 px-2 text-xs font-semibold text-white" data-testid={`ts-approve-week-${r.w.id}`} onClick={() => approveDays([r.w.id], false)}>Approve week</button>}
      </div>
    </div>
  );
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric" });

  return (
    <AppShell title="Timesheet">
      <PageHeader title="Weekly timesheet" subtitle="Tap any day to see its timeline, fix it or approve it." />
      {todayYmd && <PtoOwnerCard workers={workers.map((w) => ({ id: w.id, name: w.name, hireDate: w.hireDate, pto: readWorkerOverrides(w) }))} settings={settings} today={todayYmd} onAdded={() => { if (week) void loadPtoForRange(week, addDays(week, 6)).then(setWeekPto).catch(() => {}); }} />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, -7))} data-testid="ts-prev" aria-label="Previous week">‹</button>
        <span className="font-semibold" data-testid="ts-week">Week of {week}</span>
        <button className="min-h-11 rounded-lg border px-3" onClick={() => setWeek(addDays(week, 7))} data-testid="ts-next" aria-label="Next week">›</button>
        <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Show">
          <button className={`min-h-11 px-3 ${filter === "all" ? "bg-teal-600 text-white" : ""}`} data-testid="ts-filter-all" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button className={`min-h-11 px-3 ${filter === "review" ? "bg-teal-600 text-white" : ""}`} data-testid="ts-filter-review" aria-pressed={filter === "review"} onClick={() => setFilter("review")}>Needs review only{reviewCount ? ` (${reviewCount})` : ""}</button>
        </div>
        <button className="min-h-11 rounded-lg bg-teal-600 px-4 font-semibold text-white" data-testid="ts-approve-all" disabled={gate.loading} onClick={() => approveDays(workers.map((w) => w.id), true)}>Approve all ready ({gate.loading ? LOADING_LABEL : readyCount})</button>
        {undoSteps.length > 0 && <button className="min-h-11 rounded-lg border px-3" data-testid="ts-undo" onClick={undoLast}>Undo ({undoSteps.length})</button>}
        {selected.size > 0 && <button className="cr-btn cr-btn-primary" data-testid="ts-approve-selected" onClick={() => { void approveDays([...selected], false); setSelected(new Set()); }}>Approve selected ({selected.size})</button>}
        <label className="flex items-center gap-1 text-sm"><span className="cr-section-label">Pay period</span>
          <select name="ts-period" data-testid="ts-period" className="min-h-11 rounded-lg border bg-transparent px-2" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
            <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice a month</option>
          </select></label>
        <button className="cr-btn cr-btn-secondary" data-testid="ts-export-csv" onClick={() => void exportCsv()}>Export hours (CSV)</button>
        <Link href="/help?a=timesheet-how-counted" className="text-sm underline" data-testid="ts-how">How hours are counted</Link>
      </div>
      {(weekLoading || crewLoad === "loading") && <p role="status" aria-live="polite" className="mb-2 text-sm text-[var(--cr-muted)]" data-testid="ts-loading">Loading this week’s hours…</p>}
      {message && <p role="status" data-testid="ts-message" className="mb-2 text-sm">{message}</p>}
      <section className="cr-section mb-3" data-testid="ts-on-clock">
        <p className="cr-section-label">On the clock now ({onClock.length})</p>
        {onClock.length ? (
          <ul className="flex flex-wrap gap-2">{onClock.map(({ w, st }) => <li key={w.id} className="cr-chip2 cr-tone-teal" data-testid={`ts-on-clock-${w.id}`} data-state={st.state}>{w.name} · {stateWord[st.state]}{st.since ? ` since ${fmtTime(st.since)}` : ""}</li>)}</ul>
        ) : <p className="text-sm text-[var(--cr-muted)]" data-testid="ts-on-clock-empty">Nobody is on the clock right now.</p>}
      </section>
      {alerts.length > 0 && (
        <details className="cr-collapse mb-3" data-testid="ts-alerts" open>
          <summary>Alerts ({alerts.length})</summary>
          <ul className="mt-1 space-y-1 text-sm">{alerts.slice(0, 30).map((a) => <li key={a.key} data-testid="ts-alert" data-kind={a.kind}><button className="cr-btn-text" onClick={() => setOpen(a.open)}>{a.text}</button></li>)}</ul>
          {resolvedAlerts.length > 0 && <details className="mt-2 text-sm text-[var(--cr-muted)]" data-testid="ts-alerts-resolved"><summary>Resolved ({resolvedAlerts.length})</summary><p className="mt-1 text-xs" data-testid="ts-resolved-note">Alerts for days you&apos;ve approved. They clear at the end of the pay period.</p><ul className="mt-1 space-y-1">{resolvedAlerts.slice(0, 30).map((a) => <li key={a.key} data-testid="ts-alert-resolved" data-kind={a.kind}><button className="cr-btn-text" onClick={() => setOpen(a.open)}>{a.text} · ✓ Approved</button></li>)}</ul></details>}
        </details>
      )}
      {alerts.length === 0 && resolvedAlerts.length > 0 && (
        <details className="cr-collapse mb-3 text-sm text-[var(--cr-muted)]" data-testid="ts-alerts-resolved"><summary>Resolved ({resolvedAlerts.length})</summary><p className="mt-1 text-xs" data-testid="ts-resolved-note">Alerts for days you&apos;ve approved. They clear at the end of the pay period.</p><ul className="mt-1 space-y-1">{resolvedAlerts.slice(0, 30).map((a) => <li key={a.key} data-testid="ts-alert-resolved" data-kind={a.kind}><button className="cr-btn-text" onClick={() => setOpen(a.open)}>{a.text} · ✓ Approved</button></li>)}</ul></details>
      )}
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
            <thead><tr><th className="p-2 text-left"><label className="flex items-center gap-2"><input type="checkbox" name="ts-select-all" aria-label="Select all workers" data-testid="ts-select-all" checked={shown.length > 0 && shown.every((r) => selected.has(r.w.id))} onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.w.id)) : new Set())} />Worker</label></th>{days.map((d) => <th key={d} className="p-2 text-left">{dayLabel(d)}</th>)}<th className="p-2 text-right">Week</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.w.id} className="border-t align-top" data-testid={`ts-row-${r.w.id}`}>
                  <td className="p-2 font-semibold"><label className="flex items-center gap-2"><input type="checkbox" name={`ts-select-${r.w.id}`} data-testid={`ts-select-${r.w.id}`} checked={selected.has(r.w.id)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(r.w.id); else n.delete(r.w.id); setSelected(n); }} />{r.w.name}</label>
                    {attest[r.w.id] && <span className="cr-chip2 cr-tone-good ml-1 text-[11px] font-normal" data-testid="ts-pill-attested" data-worker={r.w.id} title={`Worker confirmed ${new Date(attest[r.w.id]).toLocaleDateString()}`}><span data-testid={`ts-attested-${r.w.id}`}>Attested</span></span>}</td>
                  {r.info.map((d) => <td key={d.date} className="p-1" data-testid={`ts-cell-${r.w.id}-${d.date}`}>{cell(r.w.id, d)}</td>)}
                  <td className="p-2">{weekEnd(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!cloud && <p className="cr-panel cr-tone-warn mt-2 text-sm" data-testid="ts-cloud-offline" role="status">Couldn&apos;t read the saved timesheet (signed out or offline). Showing this device&apos;s copy; nothing was deleted. Sign in again or refresh.{cloudError ? <span className="block text-xs" data-testid="ts-cloud-error">Details: {cloudError}</span> : null}</p>}
      {orphans.length > 0 && <p className="cr-panel cr-tone-warn mt-2 text-sm" data-testid="ts-orphan-hours" role="status">Hours saved for {orphans.length} crew record{orphans.length === 1 ? "" : "s"} not on your Team list this week ({orphans.join(", ")}). They are kept, not deleted. Check Team for a removed or re-added person.</p>}
      {!shown.length && !(gate.loading && filter === "review") && (() => { const k = timesheetEmptyKind(crewLoad, workers.length, filter); return k === "none" ? null : <p className="mt-2 text-sm text-[var(--cr-muted)]" data-testid="ts-empty" data-kind={k} role={k === "signed_out" || k === "error" ? "status" : undefined}>{k === "review_clear" ? "Nothing needs review this week." : k === "loading" ? "Loading your crew…" : k === "signed_out" ? <>You&apos;re signed out, so your crew can&apos;t load. <Link href="/login" className="underline">Sign in</Link> to see their hours.</> : k === "error" ? "Couldn't load your crew from the server. Check your connection and refresh." : <>No crew yet. Add your crew on <Link href="/employees" className="underline">Team</Link>; their taps on My day show up here.</>}</p>; })()}
      {pendingFixes.length > 0 && (
        <section className="cr-section mt-4 space-y-2" data-testid="ts-fixes">
          <h2 className="font-bold">Fix-my-time requests <span className="cr-chip2 cr-tone-warn" data-testid="ts-fix-badge">{pendingFixes.length}</span></h2>
          {fixes.filter((f) => f.status === "pending").map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span>{workers.find((w) => w.id === f.employeeId)?.name || "Worker"} · {f.date} · {f.kind.replace("_", " ")} → {fmtTime(f.at)} · “{f.reason}”</span>
              <input aria-label="Note to worker" placeholder="Note (optional)" name="ts-fix-note" data-testid="ts-fix-note" maxLength={300} className="min-h-9 flex-1 rounded border bg-transparent px-2" value={fixNotes[f.id] || ""} onChange={(e) => setFixNotes({ ...fixNotes, [f.id]: e.target.value })} />
              <button className="cr-btn cr-btn-primary" data-testid="ts-fix-approve" onClick={() => decide(f, "approved", fixNotes[f.id])}>Approve</button>
              <button className="cr-btn cr-btn-secondary" data-testid="ts-fix-deny" onClick={() => decide(f, "denied", fixNotes[f.id])}>Decline</button>
            </div>
          ))}
        </section>
      )}
      <p className="mt-4 text-xs text-[var(--cr-muted)]" data-testid="ts-footer-hint">Overtime and time off rules are in <Link href="/profile#overtime" className="underline" data-testid="ts-footer-settings">Settings</Link>. Day rules (gap, “Still driving?”, half day) are on <Link href="/employees" className="underline">Team</Link> under Timesheet rules. <Link href="/help?a=timesheet-how-counted" className="underline" data-testid="ts-footer-how">How hours are counted</Link></p>
      {open && openWorker && (
        <DayDetail key={`${open}|${approvalOf(openWorker.id, openDate)?.editedMinutes ?? ""}`} workerName={openWorker.name} date={openDate} sheet={sheets.get(open)} approval={approvalOf(openWorker.id, openDate)}
          minutes={minutesOf(openWorker.id, openDate)} extraFlags={flagsOf(openWorker.id, openDate).filter((f) => f === "edited" || f === "changed_since_approved")}
          settings={settings} schedule={scheduleFor(docs, openWorker.id, openDate)} employeeId={openWorker.id} worker={readWorkerOverrides(openWorker)}
          taps={events.filter((e) => e.employeeId === openWorker.id && e.date === openDate)} dayPay={payOf(openWorker.id, openDate)} fixes={fixes.filter((f) => f.employeeId === openWorker.id && f.date === openDate)}
          onApprove={() => approveDay(openWorker.id, openDate)} onUnapprove={() => unapproveDay(openWorker.id, openDate)}
          onSetMinutes={(m, approve, note) => setMinutes(openWorker.id, openDate, m, approve, note)} onDecide={(f, st, note) => decide(f, st, note)} onClose={() => setOpen(null)} />
      )}
    </AppShell>
  );
}
