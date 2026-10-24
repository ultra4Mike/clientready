"use client";

import OverlapBadge from "@/components/OverlapBadge";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_HOURS, businessToday, crossesMidnight, jobMinutes, scrollHour, segmentOn, zonedNow } from "@/lib/overnight";
import { CalendarViewTabs } from "@/components/ViewTabs";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ScheduleEditor from "@/components/ScheduleEditor";
import PhoneApproval from "@/components/PhoneApproval";
import { readApproval } from "@/lib/approval";
import { uniqueDocs } from "@/lib/change-orders";
import { scheduledJobs } from "@/lib/scheduled-jobs";
import { expandJobDays, dragPayload, readDragPayload } from "@/lib/job-days";
import { chipTimeRange } from "@/lib/chip-time";
import { allConflicts, bookingConflicts, clashPrompts, clockText, nextOpenSlot, readOverrides, splitConflicts } from "@/lib/conflicts";
import { ignoresTentative, isTentative, PRESETS, readCalendarFilter, saveCalendarFilter, visibleOnCalendar, type CalendarFilter } from "@/lib/calendar-filter";
import { belongsInUnscheduled, effectiveDocStatus, isDueInvoice, isSettledStatus } from "@/lib/doc-status";
import CalendarFilterBar from "@/components/CalendarFilterBar";
import { applySchedule, confirmRemovalFor, moveSchedule, omwTime, readSchedule, readWorkers, saveSchedule, DONE_CLASS, DONE_LABEL, doneState, STATUS_CLASS, STATUS_LABEL, statusClass, statusLabel, type DoneState, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

/** Enter/Space on a role="button" element does what a click does (the target only, so nested buttons keep their own keys). */
function onActivateKey(run: () => unknown) {
  return (event: { key: string; target: EventTarget; currentTarget: EventTarget; preventDefault: () => void; stopPropagation: () => void }) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault(); event.stopPropagation(); run();
  };
}

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};
type Job = { doc: SavedDocument; schedule: Schedule; day?: { index: number; count: number; offset: number } };
type View = "week" | "month" | "worker";
type Editing = { docId: string; date?: string; startTime?: string } | null;

// cal24: every hour of the day (12 AM to 11 PM). The compact view scrolls inside a box (opens at business hours or now);
// "Show 24 hours" shows them all at once. The choice is remembered on this device.
const HOURS = ALL_HOURS;
const HOURS_KEY = "clientready-calendar-hours";
const MOBILE_MODE_KEY = "clientready-calendar-mobile-mode";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parse(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(value: string, days: number) {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return ymd(date);
}
function weekStart(value: string) {
  return addDays(value, -parse(value).getDay());
}
function timeLabel(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
const text = (value: unknown) => (typeof value === "string" ? value : "");

function readDocs(): SavedDocument[] {
  const raw = window.localStorage.getItem("clientready-documents");
  return raw ? uniqueDocs(JSON.parse(raw) as SavedDocument[]) : [];
}

export default function CalendarPage({ initialView = "week" }: { initialView?: View }) {
  const [state, setState] = useState<{ docs: SavedDocument[]; workers: Worker[]; today: string }>({ docs: [], workers: [], today: "" });
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [workerId, setWorkerId] = useState("");
  const [message, setMessage] = useState("");

  // R127: approval filter, remembered per user on this device.
  const [filter, setFilterState] = useState<CalendarFilter>(PRESETS.all);
  function setFilter(next: CalendarFilter) { setFilterState(next); saveCalendarFilter(next); }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    setState({ docs: readDocs(), workers: readWorkers(), today: businessToday() }); // cal24: business-zone today, never UTC
    setFilterState(readCalendarFilter());
  }, []);

  const { docs, workers, today } = state;
  const [conflictNote, setConflictNote] = useState<{ state: string; text: string } | null>(null);
  const current = anchor || today;
  const workerName = useMemo(() => new Map(workers.map((person) => [person.id, person.name])), [workers]);

  const jobDocs = docs.filter((doc) => doc.type === "invoice" || doc.type === "proposal");
  // Multi-day jobs show on each of their days ("Day 2 of 3"); day 1 keeps the job-<id> chip.
  const jobs: Job[] = expandJobDays(scheduledJobs(jobDocs).filter((job) => visibleOnCalendar(job.doc, filter, jobDocs)));
  const skipTentative = ignoresTentative(filter);
  const clashList = allConflicts(jobDocs);
  const clashing = new Set(clashList.filter((c) => !c.tentative).flatMap((c) => [c.docId, c.otherDocId]));
  const softClashing = new Set(clashList.filter((c) => c.tentative).flatMap((c) => [c.docId, c.otherDocId]).filter((id) => !clashing.has(id))); // R127
  const unscheduled = jobDocs.filter((doc) => belongsInUnscheduled(doc, jobDocs, Boolean(readSchedule(doc.data))));

  async function save(docId: string, schedule: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) {
    // Retest bug 1: report what really happened (a refused or failed save no longer shows "Booked anyway").
    let saved = false;
    // Help retest (f): show the move right away (optimistic); the real save (job pin lookup + cloud) follows and
    // the list is re-read from storage after it, so a refused save snaps the job back.
    setState((prev) => { const moved = applySchedule(prev.docs as never[], docId, schedule, options?.confirmed); return moved ? { ...prev, docs: moved.docs as typeof prev.docs } : prev; });
    try {
      saved = Boolean(await saveSchedule(docId, schedule, options?.confirmed));
      setState((prev) => ({ ...prev, docs: readDocs() }));
      setMessage(saved ? (schedule ? "Schedule saved" : "Job unscheduled") : "Not saved: this job could not be moved (see the job for details).");
    } catch {
      setMessage("Could not save the schedule.");
      setState((prev) => ({ ...prev, docs: readDocs() }));
    }
    if (!saved) setConflictNote((note) => (note ? { state: "blocked", text: "Not moved: the schedule could not be saved." } : note));
    if (!options?.keepOpen) setEditing(null);
    return saved;
  }

  /**
   * Dropping an unscheduled job: one action sets the job date + start (and end, keeping the job's
   * length) and keeps everyone already on the job's crew, so their crew work dates/times and /crew
   * follow. The invoice issue date, numbering and due date are never changed.
   */
  function unscheduledDrop(data: Record<string, unknown> | undefined, date: string, startTime?: string): Schedule {
    const crew = (Array.isArray(data?.crew) ? data.crew : []) as { employeeId?: unknown }[];
    const workerIds = Array.from(new Set(crew.map((row) => String(row.employeeId || "")).filter(Boolean)));
    const isT = (v: unknown) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
    const start = startTime || (isT(data?.jobStart) ? String(data?.jobStart) : "");
    const base = { date, startTime: start, workerIds, status: "scheduled" as JobStatus, updatedAt: "" };
    if (!start) return base;
    const js = String(data?.jobStart || ""), je = String(data?.jobEnd || "");
    if (isT(js) && isT(je) && je !== js) return moveSchedule({ ...base, startTime: js, endTime: je }, date, start);
    return base;
  }

  const toMin = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

  function dropOn(dropDate: string, startTime?: string) {
    return async (event: React.DragEvent) => {
      event.preventDefault();
      // A later day's chip carries its offset: dropping day 2 on a date puts day 1 that many days earlier.
      const { docId, offset } = readDragPayload(event.dataTransfer.getData("text/plain"));
      return moveJob(docId, offset, dropDate, startTime);
    };
  }

  /** One move path for mouse drag, touch long-press drag and the mobile Move/Schedule pickers. */
  async function moveJob(docId: string, offset: number, dropDate: string, startTime?: string, endTime?: string) {
    {
      const date = offset ? addDays(dropDate, -offset) : dropDate;
      // Item 2 (repeat drags): decide on the list as stored NOW, not the copy loaded with the page. A background
      // sync or the previous move's cloud save can rewrite/re-key the job after render; the stale copy made the
      // drop return silently (cell highlighted, nothing saved, no prompt).
      const stored = readDocs();
      const docs = stored.length ? stored : state.docs;
      const doc = docs.find((item) => item.id === docId);
      if (!doc) {
        setState((prev) => ({ ...prev, docs }));
        setMessage("Not moved: this job changed since the calendar loaded. Try the drag again.");
        return;
      }
      if (docs !== state.docs) setState((prev) => ({ ...prev, docs }));
      const existing = readSchedule(doc.data);
      const moved = existing
        ? moveSchedule(existing, date, startTime)
        : unscheduledDrop(doc.data, date, startTime);
      // Move/Schedule sheet: an explicit end time applies to every day of the block.
      const next = endTime
        ? { ...moved, endTime, ...(moved.days ? { days: moved.days.map((d) => ({ ...d, ...(startTime ? { startTime } : {}), endTime })) } : {}) }
        : moved;
      // Same double-booking check as the schedule editor: offer the next open time, else Book anyway (recorded).
      // R127: an approved job there blocks (below); a pending/draft one only warns, with a move option.
      const { hard: clash, soft } = splitConflicts(bookingConflicts(docs, docId, next));
      const softLen = jobMinutes(next.startTime, next.endTime);
      if (!clash.length && soft.length) {
        const who = soft.map((c) => `${workerName.get(c.workerId) || "Worker"} on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("\n");
        const slot = nextOpenSlot(docs, docId, date, next.workerIds, softLen, next.startTime ? toMin(next.startTime) : undefined, { ignoreTentative: skipTentative });
        if (slot && slot !== next.startTime && window.confirm(`Tentative booking here (unapproved proposal, pending change order or unsent draft):\n${who}\n\nMove it to the next open time, ${clockText(toMin(slot))}? Cancel keeps it here.`)) {
          setConflictNote({ state: "moved", text: `Moved to the next open time, ${clockText(toMin(slot))}.` });
          return save(docId, moveSchedule(next, date, slot));
        }
        setConflictNote({ state: "soft", text: "Saved. A pending proposal also holds this time (not approved yet)." });
        return save(docId, next);
      }
      if (clash.length) {
        const who = clash.map((c) => `${workerName.get(c.workerId) || "Worker"} is already on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("\n");
        const length = jobMinutes(next.startTime, next.endTime);
        const slot = nextOpenSlot(docs, docId, date, next.workerIds, length, next.startTime ? toMin(next.startTime) : undefined, { ignoreTentative: skipTentative }) || nextOpenSlot(docs, docId, date, next.workerIds, length, undefined, { ignoreTentative: skipTentative });
        const prompts = clashPrompts(who, slot ? clockText(toMin(slot)) : "");
        if (slot && window.confirm(prompts.move)) {
          const moved = moveSchedule(next, date, slot);
          setConflictNote({ state: "moved", text: `Moved to the next open time, ${clockText(toMin(slot))}.` });
          return save(docId, moved);
        }
        if (!window.confirm(prompts.anyway)) {
          setConflictNote({ state: "blocked", text: "Not moved: someone on this job is already booked then." });
          return;
        }
        const at = new Date().toISOString();
        setConflictNote({ state: "override", text: "Booked anyway. Saved on the job." });
        return save(docId, { ...next, overrides: [...readOverrides(next.overrides), ...clash.map((c) => ({ workerId: c.workerId, otherDocId: c.docId, at }))] });
      }
      setConflictNote(null);
      await save(docId, next);
    }
  }

  // ---- Mobile (<900px): List / Calendar toggle, touch long-press drag, Move picker, Unscheduled section ----
  const [mobileMode, setMobileModeState] = useState<"list" | "calendar">("list");
  const [pickedDay, setPickedDay] = useState("");
  const [moving, setMoving] = useState<{ docId: string; offset: number; date: string; title: string; start: string; end: string; dayCount: number; workerIds: string[]; schedule?: boolean } | null>(null);
  const openDoc = (docId: string) => { window.location.assign(`/invoice?id=${encodeURIComponent(docId)}`); };
  const [unschedOpen, setUnschedOpen] = useState(false);
  const [touchDrag, setTouchDrag] = useState<{ docId: string; offset: number; label: string; x: number; y: number; over: string } | null>(null);
  useEffect(() => { Promise.resolve().then(() => { try { const m = window.localStorage.getItem(MOBILE_MODE_KEY); if (m === "calendar" || m === "list") setMobileModeState(m); } catch { /* private mode */ } }); }, []);
  function setMobileMode(next: "list" | "calendar") { setMobileModeState(next); try { window.localStorage.setItem(MOBILE_MODE_KEY, next); } catch { /* private mode */ } }
  const press = useRef<{ timer: number; x: number; y: number; started: boolean; docId: string; offset: number; label: string; mouse: boolean; target: HTMLElement; pid: number } | null>(null);
  const suppressClick = useRef(false);
  const moveJobRef = useRef(moveJob);
  useEffect(() => { moveJobRef.current = moveJob; });
  const touchDragRef = useRef(touchDrag);
  useEffect(() => { touchDragRef.current = touchDrag; }, [touchDrag]);
  function dropDateAt(x: number, y: number) {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>("[data-drop-date]")?.dataset.dropDate || "";
  }
  // Auto-scroll while dragging near the top/bottom edge of the screen.
  const autoScroll = useRef<{ id: number; dy: number } | null>(null);
  function setAutoScroll(y: number) {
    const edge = 70, h = window.innerHeight;
    const dy = y < edge ? -Math.ceil((edge - y) / 5) : y > h - edge ? Math.ceil((y - (h - edge)) / 5) : 0;
    if (!dy) { stopAutoScroll(); return; }
    if (autoScroll.current) { autoScroll.current.dy = dy; return; }
    autoScroll.current = { dy, id: window.setInterval(() => { const a = autoScroll.current; if (a) window.scrollBy(0, a.dy); }, 16) };
  }
  function stopAutoScroll() { if (autoScroll.current) window.clearInterval(autoScroll.current.id); autoScroll.current = null; }
  useEffect(() => stopAutoScroll, []);
  // Touch drag runs on native touch events: a non-passive touchmove that cancels scrolling ONLY once the long-press
  // has started, so the browser never claims the gesture as a pan (which fired pointercancel and killed the old drag).
  // Before the long-press fires, moving >8px cancels it and the page scrolls normally.
  useEffect(() => {
    const onMove = (event: TouchEvent) => {
      const p = press.current; if (!p || p.mouse) return;
      const t = event.touches[0]; if (!t) return;
      if (!p.started) { if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > 8) { window.clearTimeout(p.timer); press.current = null; } return; }
      if (event.cancelable) event.preventDefault();
      setAutoScroll(t.clientY);
      setTouchDrag((d) => d && { ...d, x: t.clientX, y: t.clientY, over: dropDateAt(t.clientX, t.clientY) });
    };
    const onEnd = (event: TouchEvent) => {
      const p = press.current; if (!p || p.mouse) return; press.current = null;
      window.clearTimeout(p.timer); stopAutoScroll();
      if (!p.started) return;
      if (event.cancelable) event.preventDefault();
      suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 400);
      const t = event.changedTouches[0];
      const day = event.type === "touchend" && t ? dropDateAt(t.clientX, t.clientY) : "";
      setTouchDrag(null);
      if (day) void moveJobRef.current(p.docId, p.offset, day);
      else if (event.type === "touchend") setMessage("Not moved: drop the job on a day.");
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
    document.addEventListener("touchcancel", onEnd);
    return () => { document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onEnd); document.removeEventListener("touchcancel", onEnd); };
  }, []);
  /** Pointer drag for the narrow layout. Mouse/pen: drag starts after moving 5px. Touch: long-press (450ms without
   *  moving >8px) starts a drag; moving first is a scroll. Presses on the Move/Schedule buttons never drag. */
  function touchHandlers(docId: string, offset: number, label: string) {
    const begin = (target: HTMLElement, pid: number, x: number, y: number) => {
      if (!press.current) return;
      press.current.started = true;
      try { target.setPointerCapture(pid); } catch { /* released */ }
      setTouchDrag({ docId, offset, label, x, y, over: dropDateAt(x, y) });
    };
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        const x = event.clientX, y = event.clientY;
        const target = event.currentTarget as HTMLElement; const pid = event.pointerId;
        const mouse = event.pointerType !== "touch";
        press.current = { x, y, started: false, docId, offset, label, mouse, target, pid, timer: mouse ? 0 : window.setTimeout(() => {
          try { navigator.vibrate?.(15); } catch { /* unsupported */ }
          begin(target, pid, x, y);
        }, 300) };
      },
      onPointerMove: (event: React.PointerEvent) => {
        const p = press.current; if (!p || !p.mouse) return;
        if (!p.started) {
          const dist = Math.hypot(event.clientX - p.x, event.clientY - p.y);
          if (p.mouse) { if (dist > 5) begin(p.target, p.pid, event.clientX, event.clientY); else return; }
          else { if (dist > 8) { window.clearTimeout(p.timer); press.current = null; } return; }
        }
        event.preventDefault();
        setAutoScroll(event.clientY);
        setTouchDrag((d) => d && { ...d, x: event.clientX, y: event.clientY, over: dropDateAt(event.clientX, event.clientY) });
      },
      onPointerUp: (event: React.PointerEvent) => {
        const p = press.current; if (!p || !p.mouse) return; press.current = null;
        window.clearTimeout(p.timer); stopAutoScroll();
        if (!p.started) return;
        suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 400);
        const day = dropDateAt(event.clientX, event.clientY);
        setTouchDrag(null);
        if (day) void moveJob(p.docId, p.offset, day);
        else setMessage("Not moved: drop the job on a day.");
      },
      onPointerCancel: () => { const p = press.current; if (!p || !p.mouse) return; press.current = null; if (p) window.clearTimeout(p.timer); stopAutoScroll(); setTouchDrag(null); },
      onContextMenu: (event: React.MouseEvent) => { if (press.current) event.preventDefault(); },
    };
  }

  function chip(job: Job, compact = false, agenda = false) {
    const tid = agenda ? "agenda-" : "";
    const people = job.schedule.workerIds.map((id) => workerName.get(id)).filter(Boolean).join(", ");
    const later = job.day && job.day.index > 1;
    return (
      <div
        key={`${job.doc.id}-${job.day?.index || 1}`}
        draggable={!agenda}
        data-testid={later ? `${tid}job-day-${job.doc.id}-${job.day!.index}` : `${tid}job-${job.doc.id}`}
        data-day={job.day ? `${job.day.index}/${job.day.count}` : undefined}
        data-status={job.schedule.status}
        data-tentative={isTentative(job.doc, jobDocs) || undefined}
        data-state={clashing.has(job.doc.id) ? "blocked" : undefined}
        data-done={doneState(job.schedule) || undefined}
        onDragStart={agenda ? undefined : (event) => event.dataTransfer.setData("text/plain", dragPayload(job.doc.id, job.day?.offset || 0))}
        {...(agenda ? touchHandlers(job.doc.id, job.day?.offset || 0, job.doc.clientName || job.doc.title) : {})}
        role="button"
        tabIndex={0}
        onKeyDown={onActivateKey(() => (agenda ? openDoc(job.doc.id) : setEditing({ docId: job.doc.id })))}
        onClick={(event) => { event.stopPropagation(); if (suppressClick.current) return; if (agenda) openDoc(job.doc.id); else setEditing({ docId: job.doc.id }); }}
        className={agenda ? `relative select-none [-webkit-touch-callout:none] [-webkit-user-select:none] touch-manipulation transition-transform ${touchDrag?.docId === job.doc.id ? "scale-[1.03] opacity-60 shadow-lg ring-2 ring-teal-400" : ""} flex min-h-11 pr-16 cursor-grab active:cursor-grabbing flex-col justify-center rounded-lg border border-l-4 px-3 py-2 text-left text-sm font-medium leading-snug shadow-sm ${statusClass(job.schedule)}${isTentative(job.doc, jobDocs) ? " cr-tentative border-dashed [&>*:not(button)]:opacity-60" : ""}` : `cr-chip2 cursor-grab min-w-0 break-words rounded-md border border-l-4 px-1.5 py-1 text-left text-xs font-medium leading-snug shadow-sm ${statusClass(job.schedule)}${isTentative(job.doc, jobDocs) ? " cr-tentative border-dashed opacity-60" : ""}`}
        title={`${crossesMidnight(job.schedule.startTime, job.schedule.endTime) ? `${timeLabel(job.schedule.startTime || "")}–${timeLabel(job.schedule.endTime || "")} (next day) · ` : ""}${job.doc.title} · ${job.doc.clientName} · ${statusLabel(job.schedule)}${job.schedule.onMyWayAt && job.schedule.status !== "done" ? ` · ${job.schedule.onMyWayBy || "Crew"} on the way` : ""}${people ? ` · ${people}` : ""}`}
      >
        {agenda ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span data-testid={`${tid}chip-time`} className="shrink-0 font-semibold tabular-nums">{job.schedule.startTime ? chipTimeRange(job.schedule.startTime, job.schedule.endTime) : "Any time"}{crossesMidnight(job.schedule.startTime, job.schedule.endTime) ? " (next day)" : ""}</span>{" "}
            <span className="min-w-0 truncate">{job.doc.title}{job.doc.clientName ? <span className="opacity-80"> · {job.doc.clientName}</span> : null}</span>
          </span>
        ) : (
          <>
            {job.schedule.startTime && <span data-testid={`${tid}chip-time`} className="block text-[11px] font-semibold tabular-nums">{chipTimeRange(job.schedule.startTime, job.schedule.endTime)}{crossesMidnight(job.schedule.startTime, job.schedule.endTime) ? " ☾" : ""}</span>}
            {!job.day && crossesMidnight(job.schedule.startTime, job.schedule.endTime) && <span data-testid={`${tid}overnight-day-label`} className="mr-1 inline-block rounded bg-black/10 px-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-white/10">Day 1 of 2</span>}
            {job.day && <span data-testid={`${tid}day-label`} className="mr-1 inline-block rounded bg-black/10 px-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-white/10">Day {job.day.index} of {job.day.count}</span>}
            {job.doc.clientName || job.doc.title}
          </>
        )}
        {agenda && <button type="button" data-testid={`move-${job.doc.id}${later ? `-${job.day!.index}` : ""}`} aria-label={`Move ${job.doc.title || job.doc.clientName || "job"} to another day`} onClick={(event) => { event.stopPropagation(); setMoving({ docId: job.doc.id, offset: job.day?.offset || 0, date: job.schedule.date, title: job.doc.clientName || job.doc.title, start: job.schedule.startTime || "", end: job.schedule.endTime || "", dayCount: job.day?.count || 1, workerIds: job.schedule.workerIds }); }} onKeyDown={(event) => event.stopPropagation()} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-current/30 bg-[var(--cr-card)]/70 px-2.5 py-1.5 text-xs font-semibold">Move</button>}
        {agenda && !job.day && crossesMidnight(job.schedule.startTime, job.schedule.endTime) && <span data-testid={`${tid}overnight-day-label`} className="mt-0.5 block w-fit rounded bg-black/10 px-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-white/10">Day 1 of 2 · until {timeLabel(job.schedule.endTime || "")}</span>}
        {agenda && job.day && <span data-testid={`${tid}day-label`} className="mt-0.5 block w-fit rounded bg-black/10 px-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-white/10">Day {job.day.index} of {job.day.count}</span>}
        {isTentative(job.doc, jobDocs) && <span data-testid="not-approved-tag" className="mt-0.5 inline-block rounded border border-dashed border-current px-1 text-[10px] font-semibold uppercase tracking-wide">Not approved</span>}
        {!compact && people && <span className="block truncate opacity-80">{people}</span>}
        {compact && softClashing.has(job.doc.id) && <span data-testid="overlap-dot" data-soft="true" title="A job that isn't approved yet holds this time" className="block text-amber-700/80 dark:text-amber-300/80">Pending overlap</span>}
        {compact && clashing.has(job.doc.id) && <button type="button" data-testid="overlap-dot" aria-label={`Overlap: same worker on another job at this time. Open ${job.doc.title || job.doc.clientName || "job"}`} title="Overlap: same worker on another job at this time" onClick={(event) => { event.stopPropagation(); setEditing({ docId: job.doc.id }); }} onKeyDown={(event) => event.stopPropagation()} className="block text-left font-semibold text-amber-700 dark:text-amber-300">⚠ Overlap</button>}
        {!compact && (clashing.has(job.doc.id) || softClashing.has(job.doc.id)) && <span role="presentation" className="block" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><OverlapBadge docs={docs} doc={job.doc} onMoved={() => setState((prev) => ({ ...prev, docs: readDocs() }))} /></span>}
        {job.schedule.onMyWayAt && job.schedule.status !== "done" && <span className="block truncate opacity-80" data-testid={`${tid}omw`}>🚗 {compact ? "On way" : `On the way · ${omwTime(job.schedule.onMyWayAt)}`}</span>}
        {doneState(job.schedule) === "awaiting" && <span className="block truncate opacity-80" data-testid={`${tid}done-awaiting`}>{compact ? "To confirm" : DONE_LABEL.awaiting}</span>}
        {!compact && doneState(job.schedule) === "confirmed" && <span className="block truncate opacity-80">{DONE_LABEL.confirmed}</span>}
      </div>
    );
  }

  /** cal24: an overnight job from the day before, shown on this day as "continues until 4am". */
  const continuing = (day: string) => jobs.filter((job) => job.schedule.date !== day && segmentOn(job.schedule, day)?.continued);
  function contChip(job: Job, agenda = false) {
    return (
      <div
        key={`cont-${job.doc.id}`}
        data-testid={`${agenda ? "agenda-" : ""}job-cont-${job.doc.id}`}
        data-overnight="continued"
        role="button"
        tabIndex={0}
        onKeyDown={onActivateKey(() => setEditing({ docId: job.doc.id }))}
        onClick={(event) => { event.stopPropagation(); setEditing({ docId: job.doc.id }); }}
        title={`${crossesMidnight(job.schedule.startTime, job.schedule.endTime) ? `${timeLabel(job.schedule.startTime || "")}–${timeLabel(job.schedule.endTime || "")} (next day) · ` : ""}Continues from the day before · ${job.doc.clientName || job.doc.title}${job.doc.clientName ? ` · ${job.doc.title}` : ""}`}
        aria-label={`Until ${timeLabel(job.schedule.endTime || "")} · ${job.doc.clientName || job.doc.title} · continues from the night before`}
        className={`cr-chip2 cr-chip-cont cursor-pointer min-w-0 break-words rounded-md border border-dashed border-l-4 px-1.5 py-1 text-left font-medium leading-snug opacity-90 ${agenda ? "min-h-11 text-sm" : "text-xs"} ${statusClass(job.schedule)}`}
      >
        <span data-testid="overnight-day-label" className="mr-1 inline-block rounded bg-black/10 px-1 text-[10px] font-semibold uppercase tracking-wide dark:bg-white/10">Day 2 of 2</span>{job.doc.clientName || job.doc.title}
        <span className="block text-[10px] opacity-80">until {timeLabel(job.schedule.endTime || "")} · started {parse(job.schedule.date).toLocaleDateString("en-US", { weekday: "short" })} night</span>
      </div>
    );
  }

  // cal24: compact (scrolls, opens at business hours / now) vs all 24 hours, remembered on this device.
  const [full24, setFull24] = useState(false);
  useEffect(() => { Promise.resolve().then(() => { try { setFull24(window.localStorage.getItem(HOURS_KEY) === "24"); } catch { /* private mode */ } }); }, []);
  function toggle24() { const next = !full24; setFull24(next); try { window.localStorage.setItem(HOURS_KEY, next ? "24" : "compact"); } catch { /* private mode */ } }
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekKey = current ? addDays(weekStart(current), 0) : "";
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || full24 || view !== "week" || !weekKey) return;
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
    const starts = jobs.filter((job) => days.includes(job.schedule.date) && job.schedule.startTime).map((job) => Number(job.schedule.startTime.slice(0, 2)));
    const hour = scrollHour(days.includes(today), zonedNow().minutes, starts.length ? Math.min(...starts) : undefined);
    const row = box.querySelector<HTMLElement>(`[data-hour="${hour}"]`);
    if (row) box.scrollTop = row.offsetTop;
    box.dataset.scrollHour = String(hour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full24, view, weekKey, today, jobs.length]);

  const weekDays = current ? Array.from({ length: 7 }, (_, index) => addDays(weekStart(current), index)) : [];
  const monthFirst = current ? `${current.slice(0, 8)}01` : "";
  const monthCells = useMemo(() => {
    if (!monthFirst) return [];
    const first = parse(monthFirst);
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let day = 1; day <= count; day += 1) cells.push(`${monthFirst.slice(0, 8)}${String(day).padStart(2, "0")}`);
    return cells;
  }, [monthFirst]);

  function shift(amount: number) {
    if (view === "month") {
      const first = parse(monthFirst);
      setAnchor(ymd(new Date(first.getFullYear(), first.getMonth() + amount, 1)));
    } else {
      setAnchor(addDays(current, amount * 7));
    }
  }

  const editingDoc = editing ? docs.find((doc) => doc.id === editing.docId) : null;
  const heading = view === "month" && monthFirst
    ? parse(monthFirst).toLocaleString("en-US", { month: "long", year: "numeric" })
    : weekDays.length ? `Week of ${parse(weekDays[0]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
  const workerJobs = jobs
    .filter((job) => job.schedule.workerIds.includes(workerId))
    .sort((a, b) => `${a.schedule.date}${a.schedule.startTime}`.localeCompare(`${b.schedule.date}${b.schedule.startTime}`));

  return (
    <AppShell title="Calendar">
      <PageHeader title="Calendar" subtitle={<><span className="hidden sm:inline">Drag jobs onto the week or month. Click a slot or job to edit it.</span><span className="sm:hidden">Tap a slot or job to edit it.</span></>} actions={<a href="/invoice?visit=1&new=1#schedule" data-testid="calendar-new-job" className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">New job</a>} />
      <section className="py-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <CalendarViewTabs current={view} onPick={setView} />
          {view !== "worker" && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => shift(-1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-500/30 px-3 text-sm font-medium transition hover:border-teal-400"><span aria-hidden="true" className="mr-1">‹</span>Previous</button>
              <h1 className="min-w-0 flex-1 text-center text-lg font-bold tracking-tight sm:flex-none sm:px-2" data-testid="calendar-heading">{heading}</h1>
              <button type="button" onClick={() => shift(1)} className="inline-flex min-h-11 items-center rounded-lg border border-slate-500/30 px-3 text-sm font-medium transition hover:border-teal-400">Next<span aria-hidden="true" className="ml-1">›</span></button>
              <button type="button" onClick={() => setAnchor(today)} className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">Today</button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {(Object.keys(STATUS_LABEL) as JobStatus[]).filter((key) => key !== "done").map((key) => <span key={key} className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium ${STATUS_CLASS[key]}`}>{STATUS_LABEL[key]}</span>)}
          {(Object.keys(DONE_LABEL) as DoneState[]).map((key) => <span key={key} data-testid={`legend-done-${key}`} className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 font-medium ${DONE_CLASS[key]}`}>{DONE_LABEL[key]}</span>)}
          <span className="basis-full opacity-90 sm:basis-auto"><span className="hidden sm:inline">Drag a job to move it. Click a slot or job to edit.</span><span className="sm:hidden">Tap a job or time slot to edit or move it.</span></span>
        </div>
        <CalendarFilterBar filter={filter} onChange={setFilter} />
        {message && <p role="status" className="pointer-events-none fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-teal-500/30 bg-[var(--cr-card)] px-3 py-2 text-sm shadow-lg" data-testid="calendar-message">{message}</p>}
        {conflictNote && <p role="status" className={`mt-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${conflictNote.state === "moved" ? "cr-tone-teal border-teal-400 bg-teal-50 text-teal-900" : "cr-tone-warn border-amber-400 bg-amber-50 text-amber-900"}`} data-testid="calendar-conflict" data-state={conflictNote.state}>{conflictNote.text}</p>}

        {editing && editingDoc && (
          <div className="mt-4 rounded-2xl border border-teal-500/30 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{editingDoc.title} · {editingDoc.clientName}</p>
              <a href={`/invoice?id=${encodeURIComponent(editingDoc.id)}`} className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-300">Open {editingDoc.type}</a>
            </div>
            {!isSettledStatus(effectiveDocStatus(editingDoc as never, docs as never)) && (isTentative(editingDoc, docs) || readApproval((editingDoc.data as Record<string, unknown> | undefined)?.approval)?.status === "approved") && (
              <div className="mb-3" data-testid="popover-approval">
                <PhoneApproval compact docId={editingDoc.id} status={effectiveDocStatus(editingDoc as never, docs as never)} approval={readApproval((editingDoc.data as Record<string, unknown> | undefined)?.approval)}
                  ownerName={(() => { try { return String(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}").ownerName || ""); } catch { return ""; } })()}
                  onSend={() => { window.location.href = `/invoice?id=${encodeURIComponent(editingDoc.id)}#send`; }}
                  onChange={() => setState((prev) => ({ ...prev, docs: readDocs() }))} />
              </div>
            )}
            {!readSchedule(editingDoc.data) && (
              <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium">Job
                <select aria-label="Job to schedule" value={editing.docId} onChange={(event) => setEditing({ ...editing, docId: event.target.value })} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30">
                  {unscheduled.map((doc) => <option key={doc.id} value={doc.id}>{doc.title} · {doc.clientName}</option>)}
                </select>
              </label>
            )}
            <ScheduleEditor
              key={`${editing.docId}-${editing.date || ""}-${editing.startTime || ""}`}
              value={readSchedule(editingDoc.data)}
              workers={workers}
              docId={editing.docId}
              defaults={{ date: editing.date, startTime: editing.startTime }}
              onSave={(schedule, options) => save(editing.docId, schedule, options)}
              confirmRemove={(ids) => confirmRemovalFor(editing.docId, ids)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_14rem]">
          <div className="min-w-0 rounded-2xl border border-slate-500/25 bg-[var(--cr-card)] p-2 shadow-sm sm:p-3 min-[900px]:overflow-x-auto max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
            {view === "week" && (
              <div className="hidden min-[900px]:block" data-testid="week-grid" data-hours={full24 ? "24" : "compact"}>
                <div className="mb-1.5 flex items-center justify-end gap-2 text-xs">
                  <span className="opacity-70" data-testid="cal-hours-note">{full24 ? "Showing all 24 hours" : "12 AM to 11 PM · scroll for night hours"}</span>
                  <button type="button" data-testid="cal-hours-toggle" aria-pressed={full24} onClick={toggle24} className="inline-flex min-h-9 items-center rounded-lg border border-slate-500/30 px-3 font-medium transition hover:border-teal-400">{full24 ? "Compact view" : "Show 24 hours"}</button>
                </div>
                <div className="grid min-w-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
                  <div />
                  {weekDays.map((day) => (
                    <div key={day} className={`border-b border-slate-500/30 px-2 py-2.5 text-center text-sm font-semibold ${day === today ? "rounded-t-lg bg-teal-500/15 text-teal-600 dark:text-teal-300" : ""}`}>
                      {DAY_NAMES[parse(day).getDay()]} {parse(day).getDate()}
                    </div>
                  ))}
                  <div className="p-1.5 pr-2 text-right text-[11px] font-medium uppercase tracking-wide opacity-70">Any</div>
                  {weekDays.map((day) => (
                    <div key={`any-${day}`} data-testid={`slot-${day}-any`} role="group" aria-label={`${day}, any time`} onDragOver={(event) => event.preventDefault()} onDrop={dropOn(day, "")} className={`min-h-10 space-y-1 border-b border-l border-slate-500/20 bg-slate-500/5 p-1 ${day === today ? "bg-teal-500/10" : ""}`}>
                      {jobs.filter((job) => job.schedule.date === day && !job.schedule.startTime).map((job) => chip(job, true))}
                    </div>
                  ))}
                </div>
                <div ref={scrollRef} data-testid="week-hours" className={`relative grid min-w-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))] ${full24 ? "" : "max-h-[36rem] overflow-y-auto overscroll-contain"}`}>
                  {HOURS.map((hour) => (
                    <div key={hour} className="contents">
                      <div data-hour={hour} data-testid={`hour-label-${String(hour).padStart(2, "0")}`} className="p-1.5 pr-2 text-right text-[11px] font-medium tabular-nums opacity-70">{timeLabel(`${String(hour).padStart(2, "0")}:00`)}</div>
                      {weekDays.map((day) => {
                        const slot = `${String(hour).padStart(2, "0")}:00`;
                        const here = jobs.filter((job) => job.schedule.date === day && job.schedule.startTime && Number(job.schedule.startTime.slice(0, 2)) === hour);
                        const cont = hour === 0 ? continuing(day) : [];
                        return (
                          <div
                            key={`${day}-${hour}`}
                            data-testid={`slot-${day}-${String(hour).padStart(2, "0")}`}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={dropOn(day, slot)}
                            role="button"
                            tabIndex={-1}
                            aria-label={`Schedule at ${day} ${slot}`}
                            onKeyDown={onActivateKey(() => unscheduled.length ? setEditing({ docId: unscheduled[0].id, date: day, startTime: slot }) : setMessage("Every job is scheduled. Click a job to change it."))}
                            onClick={() => unscheduled.length ? setEditing({ docId: unscheduled[0].id, date: day, startTime: slot }) : setMessage("Every job is scheduled. Click a job to change it.")}
                            className={`min-h-12 space-y-1 border-b border-l border-slate-500/20 p-1 transition hover:bg-teal-500/10 ${day === today ? "bg-teal-500/10" : ""} ${hour < 6 || hour >= 20 ? "cr-night-slot bg-slate-500/5" : ""}`}
                          >
                            {cont.map((job) => contChip(job))}
                            {here.map((job) => chip(job))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {(view === "week" || view === "month") && (
              <div className="mb-3 space-y-3 min-[900px]:hidden" data-testid="mobile-cal-controls">
                <div role="group" aria-label="Calendar layout" className="inline-flex rounded-lg border border-slate-500/30 p-0.5 text-sm font-medium">
                  {(["list", "calendar"] as const).map((m) => (
                    <button key={m} type="button" data-testid={`mobile-mode-${m}`} aria-pressed={mobileMode === m} onClick={() => setMobileMode(m)} className={`min-h-10 rounded-md px-4 ${mobileMode === m ? "bg-teal-500 text-slate-950!" : ""}`}>{m === "list" ? "List" : "Calendar"}</button>
                  ))}
                </div>
                <details open={unschedOpen} onToggle={(event) => setUnschedOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-xl border border-slate-500/30 bg-[var(--cr-card)] text-sm" data-testid="mobile-unscheduled">
                  <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold">Unscheduled ({unscheduled.length})</summary>
                  <div className="space-y-1.5 px-3 pb-3">
                    <p className="text-xs opacity-80">Press and hold a job, then drag it onto a day. Or tap Schedule.</p>
                    {unscheduled.length === 0 && <p className="rounded-lg border border-dashed border-slate-500/40 p-3 text-center text-xs">None.</p>}
                    {unscheduled.map((doc) => (
                      <div key={doc.id} data-testid={`m-unscheduled-${doc.id}`} {...touchHandlers(doc.id, 0, doc.clientName || doc.title)} className={`flex min-h-11 select-none touch-manipulation items-center gap-2 rounded-lg border border-slate-500/40 px-3 transition-transform [-webkit-touch-callout:none] ${touchDrag?.docId === doc.id ? "scale-[1.03] opacity-60 shadow-lg ring-2 ring-teal-400" : ""}`}>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{doc.title} · {doc.clientName || "No client"}</span>
                        <button type="button" data-testid={`m-schedule-${doc.id}`} onClick={() => { if (suppressClick.current) return; setMoving({ docId: doc.id, offset: 0, date: pickedDay || current, title: doc.clientName || doc.title, start: "", end: "", dayCount: 1, workerIds: readSchedule(doc.data)?.workerIds || [], schedule: true }); }} className="shrink-0 rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950!">Schedule</button>
                      </div>
                    ))}
                  </div>
                </details>
                {mobileMode === "calendar" && (() => {
                  const sel = pickedDay || current;
                  const first = `${sel.slice(0, 8)}01`;
                  const f = parse(first);
                  const count = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
                  const cells: (string | null)[] = Array.from({ length: f.getDay() }, () => null);
                  for (let d = 1; d <= count; d += 1) cells.push(`${first.slice(0, 8)}${String(d).padStart(2, "0")}`);
                  const goMonth = (n: number) => setPickedDay(ymd(new Date(f.getFullYear(), f.getMonth() + n, 1)));
                  const selJobs = jobs.filter((job) => job.schedule.date === sel).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime));
                  return (
                    <div data-testid="mobile-month">
                      <div className="mb-2 flex items-center gap-2">
                        <button type="button" aria-label="Previous month" onClick={() => goMonth(-1)} className="min-h-10 rounded-lg border border-slate-500/30 px-3">‹</button>
                        <p className="flex-1 text-center font-semibold" data-testid="mobile-month-heading">{f.toLocaleString("en-US", { month: "long", year: "numeric" })}</p>
                        <button type="button" aria-label="Next month" onClick={() => goMonth(1)} className="min-h-10 rounded-lg border border-slate-500/30 px-3">›</button>
                      </div>
                      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase opacity-70">{DAY_NAMES.map((n) => <div key={n}>{n[0]}</div>)}</div>
                      <div className="mt-1 grid grid-cols-7 gap-1">
                        {cells.map((day, i) => {
                          if (!day) return <div key={`b-${i}`} />;
                          const n = jobs.filter((job) => job.schedule.date === day).length + continuing(day).length;
                          return (
                            <button key={day} type="button" data-testid={`mday-${day}`} data-drop-date={day} aria-label={`${day}, ${n} job${n === 1 ? "" : "s"}`} aria-pressed={day === sel} onClick={() => setPickedDay(day)}
                              className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm tabular-nums ${day === sel ? "border-teal-400 bg-teal-500/20 font-bold" : "border-slate-500/20"} ${touchDrag?.over === day ? "ring-2 ring-teal-400 bg-teal-500/30" : ""} ${day === today ? "text-teal-600 dark:text-teal-300 font-bold" : ""}`}>
                              {parse(day).getDate()}
                              {n > 0 && <span data-testid={`mday-count-${day}`} className="mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-500 px-1 text-[10px] font-semibold leading-none text-slate-950!" aria-hidden="true">{n}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <section className="mt-3" data-testid="mobile-day-agenda" data-drop-date={sel}>
                        <h2 className="mb-1.5 text-sm font-semibold">{parse(sel).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h2>
                        <div className="space-y-1.5">
                          {continuing(sel).map((job) => contChip(job, true))}
                          {selJobs.map((job) => chip(job, false, true))}
                          {selJobs.length === 0 && continuing(sel).length === 0 && <p className="px-3 py-2 text-sm text-[var(--cr-muted)]">No jobs</p>}
                        </div>
                      </section>
                    </div>
                  );
                })()}
              </div>
            )}
            {(view === "week" || view === "month") && (() => {
              const days = (view === "week" ? weekDays : monthCells.filter((day): day is string => Boolean(day)))
                .filter((day) => view === "week" || day === today || jobs.some((job) => job.schedule.date === day) || continuing(day).length > 0 || docs.some((doc) => isDueInvoice(doc) && doc.data?.dueDate === day));
              return (
                <div className={`space-y-3 min-[900px]:hidden ${mobileMode === "calendar" ? "hidden" : ""}`} data-testid="agenda-list">
                  {days.length === 0 && <p className="py-8 text-center text-sm text-[var(--cr-muted)]">No jobs this month.</p>}
                  {days.map((day) => {
                    const dayJobs = jobs.filter((job) => job.schedule.date === day).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime));
                    const due = view === "month" ? docs.filter((doc) => isDueInvoice(doc) && doc.data?.dueDate === day) : [];
                    return (
                      <section key={day} data-testid={`agenda-day-${day}`} data-drop-date={day} className={touchDrag?.over === day ? "rounded-xl ring-2 ring-teal-400" : ""}>
                        <h2 className={`sticky top-[env(safe-area-inset-top)] z-10 -mx-2 mb-1.5 max-sm:mx-0 max-sm:rounded-lg max-sm:border max-sm:border-teal-500/15 flex items-center gap-2 px-3 py-2 text-sm font-semibold backdrop-blur sm:-mx-3 ${day === today ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "bg-[var(--cr-card)]/95"}`}>
                          <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${day === today ? "bg-teal-500 text-slate-950!" : "bg-slate-500/10"}`}>{parse(day).getDate()}</span>
                          {parse(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                          {day === today && <span className="ml-auto text-xs font-semibold uppercase tracking-wide">Today</span>}
                        </h2>
                        <div className="space-y-1.5">
                          {continuing(day).map((job) => contChip(job, true))}
                          {dayJobs.map((job) => chip(job, false, true))}
                          {due.map((doc) => (
                            <a key={`agenda-due-${doc.id}`} href={`/invoice-view?id=${encodeURIComponent(doc.id)}`} className="flex min-h-11 items-center rounded-lg border border-dashed border-slate-500/30 px-3 text-sm text-[var(--cr-muted)]" data-testid={`agenda-due-${doc.id}`}>Due: {doc.title}</a>
                          ))}
                          {dayJobs.length === 0 && due.length === 0 && continuing(day).length === 0 && <p className="px-3 py-2 text-sm text-[var(--cr-muted)]">No jobs</p>}
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            })()}
            {view === "month" && (
              <div className="hidden min-w-[36rem] min-[900px]:block" data-testid="month-grid">
                <div className="grid grid-cols-7 gap-1.5 pb-1 text-center text-xs font-semibold uppercase tracking-wide opacity-70">{DAY_NAMES.map((name) => <div key={name}>{name}</div>)}</div>
                <div className="mt-1 grid grid-cols-7 gap-1.5">
                  {monthCells.map((day, index) => (
                    <div
                      key={day || `blank-${index}`}
                      data-testid={day ? `day-${day}` : undefined}
                      onDragOver={(event) => day && event.preventDefault()}
                      onDrop={day ? dropOn(day) : undefined}
                      role={day ? "button" : undefined}
                      tabIndex={day ? -1 : undefined}
                      aria-label={day ? `Schedule on ${day}` : undefined}
                      onKeyDown={onActivateKey(() => day && unscheduled.length && setEditing({ docId: unscheduled[0].id, date: day }))}
                      onClick={() => day && unscheduled.length && setEditing({ docId: unscheduled[0].id, date: day })}
                      className={`min-h-28 rounded-xl border p-1.5 text-xs transition hover:bg-teal-500/5 ${day ? "border-slate-500/25 bg-[var(--cr-bg)]" : "border-transparent"} ${day === today ? "ring-2 ring-teal-400" : ""}`}
                    >
                      {day && <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${day === today ? "bg-teal-500 text-slate-950!" : ""}`}>{parse(day).getDate()}</div>}
                      <div className="space-y-0.5">
                        {day && continuing(day).map((job) => contChip(job))}
                        {day && jobs.filter((job) => job.schedule.date === day).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime)).map((job) => chip(job, true))}
                        {day && docs.filter((doc) => isDueInvoice(doc) && doc.data?.dueDate === day).map((doc) => (
                          <a key={`due-${doc.id}`} href={`/invoice-view?id=${encodeURIComponent(doc.id)}`} onClick={(event) => event.stopPropagation()} className="block truncate opacity-70" data-testid={`due-${doc.id}`}>Due: {doc.title}</a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {view === "worker" && (
              <div className="space-y-3" data-testid="worker-view">
                <label className="flex flex-col gap-1.5 text-sm font-medium">Worker
                  <select aria-label="Worker" value={workerId} onChange={(event) => setWorkerId(event.target.value)} className="max-w-xs rounded-lg border border-slate-500/40 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30">
                    <option value="">Pick a worker</option>
                    {workers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
                {workerId && workerJobs.length === 0 && <p className="rounded-xl border border-dashed border-slate-500/40 p-6 text-center text-sm opacity-70">No jobs assigned.</p>}
                {workerJobs.map((job) => (
                  <div key={job.doc.id} className="space-y-1 rounded-xl border border-slate-500/30 bg-[var(--cr-card)] p-4 text-sm shadow-sm" data-testid={`worker-job-${job.doc.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{text(job.doc.data?.clientName) || job.doc.clientName} · {job.doc.title}</p>
                      <select aria-label="Status" value={job.schedule.status} onChange={(event) => save(job.doc.id, { ...job.schedule, status: event.target.value as JobStatus })} data-done={doneState(job.schedule) || undefined} className={`rounded border px-2 py-0.5 text-xs ${statusClass(job.schedule)}`}>
                        {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => <option key={key} value={key}>{key === "done" ? statusLabel({ status: "done", confirmedAt: job.schedule.confirmedAt }) : STATUS_LABEL[key]}</option>)}
                      </select>
                    </div>
                    <p className="opacity-80">{parse(job.schedule.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {job.schedule.startTime ? timeLabel(job.schedule.startTime) : "any time"}{job.schedule.endTime ? ` to ${timeLabel(job.schedule.endTime)}` : ""}</p>
                    {text(job.doc.data?.clientPhone) && <p><a href={`tel:${text(job.doc.data?.clientPhone)}`} className="underline">{text(job.doc.data?.clientPhone)}</a></p>}
                    {text(job.doc.data?.clientEmail) && <p><a href={`mailto:${text(job.doc.data?.clientEmail)}`} className="underline">{text(job.doc.data?.clientEmail)}</a></p>}
                    {text(job.doc.data?.clientAddress) && <p>{text(job.doc.data?.clientAddress)}</p>}
                    <p className="text-xs opacity-60">With: {job.schedule.workerIds.map((id) => workerName.get(id) || "Former worker").join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="h-fit rounded-2xl border border-slate-500/30 bg-[var(--cr-card)] p-4 text-sm shadow-sm lg:sticky lg:top-20 print:hidden max-[899px]:hidden" data-testid="unscheduled">
            <p className="font-semibold">Unscheduled jobs</p>
            <p className="mb-2 text-xs opacity-90">Drag onto the calendar, or click to set a time.</p>
            {unscheduled.length === 0 && <p className="rounded-lg border border-dashed border-slate-500/40 p-3 text-center text-xs opacity-90">None.</p>}
            <div className="space-y-1.5">
              {unscheduled.map((doc) => (
                <div
                  key={doc.id}
                  draggable
                  data-testid={`unscheduled-${doc.id}`}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", doc.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onActivateKey(() => setEditing({ docId: doc.id, date: current }))}
                  onClick={() => setEditing({ docId: doc.id, date: current })}
                  className="flex min-h-11 cursor-grab items-center truncate rounded-lg border border-slate-500/40 px-3 text-xs font-medium transition hover:border-teal-400 hover:bg-teal-500/5"
                >
                  {doc.title} · {doc.clientName || "No client"}
                </div>
              ))}
            </div>
          </aside>
        </div>
        {moving && (
          <div className="fixed inset-0 z-[200] flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="Move job" data-testid="move-sheet" onClick={() => setMoving(null)}>
            <div className="w-full rounded-t-2xl bg-[var(--cr-card)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl" onClick={(event) => event.stopPropagation()}>
              <p className="font-semibold">{moving.schedule ? "Schedule" : "Move"} {moving.title}</p>
              <p className="mb-3 text-xs opacity-80">{moving.dayCount > 1 ? `A ${moving.dayCount}-day job moves as a block. ` : ""}Keeps the crew. Leave the times to keep them as they are.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">{moving.dayCount > 1 ? "First day" : "Day"}
                  <input type="date" data-testid="move-date" value={moving.date} onChange={(event) => setMoving({ ...moving, date: event.target.value })} className="min-h-11 rounded-lg border border-slate-500/40 bg-transparent px-3" />
                </label>
                {moving.dayCount > 1 && moving.date && <p className="col-span-2 text-xs opacity-80" data-testid="move-end-date">Last day: {parse(addDays(moving.date, moving.dayCount - 1)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>}
                <label className="flex flex-col gap-1.5 text-sm font-medium">Start
                  <input type="time" data-testid="move-start" value={moving.start} onChange={(event) => { const v = event.target.value; const len = moving.start && moving.end ? jobMinutes(moving.start, moving.end) : 60; setMoving({ ...moving, start: v, end: v ? `${String(Math.floor(((toMin(v) + len) % 1440) / 60)).padStart(2, "0")}:${String((toMin(v) + len) % 60).padStart(2, "0")}` : moving.end }); }} className="min-h-11 rounded-lg border border-slate-500/40 bg-transparent px-3" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">End
                  <input type="time" data-testid="move-end" value={moving.end} onChange={(event) => setMoving({ ...moving, end: event.target.value })} className="min-h-11 rounded-lg border border-slate-500/40 bg-transparent px-3" />
                </label>
              </div>
              {(() => {
                const len = moving.start && moving.end ? jobMinutes(moving.start, moving.end) : 60;
                const slot = moving.date ? nextOpenSlot(readDocs().length ? readDocs() : state.docs, moving.docId, moving.date, moving.workerIds, len, 7 * 60, { ignoreTentative: skipTentative }) : "";
                return <button type="button" data-testid="move-next-open" disabled={!slot || slot === moving.start} onClick={() => { const e = (toMin(slot) + len) % 1440; setMoving({ ...moving, start: slot, end: `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}` }); }} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-teal-500 px-4 text-sm font-semibold disabled:opacity-50">Use next open time{slot ? `: ${clockText(toMin(slot))}` : ""}</button>;
              })()}
              <button type="button" data-testid="move-more" onClick={() => { const m = moving; setMoving(null); setEditing({ docId: m.docId, date: m.date }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-2 block text-sm font-medium text-teal-600 underline dark:text-teal-300">More options (days, crew)</button>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setMoving(null)} className="min-h-11 flex-1 rounded-lg border border-slate-500/40 font-medium">Cancel</button>
                <button type="button" data-testid="move-save" disabled={!moving.date || (moving.schedule && !moving.start)} onClick={() => { const m = moving; setMoving(null); void moveJob(m.docId, m.offset, m.date, m.start || undefined, m.end || undefined); }} className="min-h-11 flex-1 rounded-lg bg-teal-500 font-semibold text-slate-950! disabled:opacity-50">Move</button>
              </div>
            </div>
          </div>
        )}
        {touchDrag && <div aria-hidden="true" data-testid="touch-drag-ghost" className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-full rounded-lg border border-teal-400 bg-[var(--cr-card)] px-3 py-1.5 text-sm font-semibold shadow-lg" style={{ left: Math.min(Math.max(touchDrag.x, 90), (typeof window === "undefined" ? 400 : window.innerWidth) - 90), top: touchDrag.y - 12 }}>{touchDrag.label}{touchDrag.over ? ` → ${parse(touchDrag.over).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>}
      </section>
    </AppShell>
  );
}
