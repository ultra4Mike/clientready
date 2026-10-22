"use client";

import OverlapBadge from "@/components/OverlapBadge";
import { useEffect, useMemo, useState } from "react";
import { CalendarViewTabs } from "@/components/ViewTabs";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import ScheduleEditor from "@/components/ScheduleEditor";
import { uniqueDocs } from "@/lib/change-orders";
import { scheduledJobs } from "@/lib/scheduled-jobs";
import { allConflicts, bookingConflicts, clockText, nextOpenSlot, readOverrides, splitConflicts } from "@/lib/conflicts";
import { ignoresTentative, isTentative, PRESETS, readCalendarFilter, saveCalendarFilter, visibleOnCalendar, type CalendarFilter } from "@/lib/calendar-filter";
import CalendarFilterBar from "@/components/CalendarFilterBar";
import { confirmRemovalFor, moveSchedule, omwTime, readSchedule, readWorkers, saveSchedule, DONE_CLASS, DONE_LABEL, doneState, STATUS_CLASS, STATUS_LABEL, statusClass, statusLabel, type DoneState, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};
type Job = { doc: SavedDocument; schedule: Schedule };
type View = "week" | "month" | "worker";
type Editing = { docId: string; date?: string; startTime?: string } | null;

const HOURS = Array.from({ length: 15 }, (_, index) => index + 6); // 6:00 to 20:00
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
    setState({ docs: readDocs(), workers: readWorkers(), today: ymd(new Date()) });
    setFilterState(readCalendarFilter());
  }, []);

  const { docs, workers, today } = state;
  const [conflictNote, setConflictNote] = useState<{ state: string; text: string } | null>(null);
  const current = anchor || today;
  const workerName = useMemo(() => new Map(workers.map((person) => [person.id, person.name])), [workers]);

  const jobDocs = docs.filter((doc) => doc.type === "invoice" || doc.type === "proposal");
  const jobs: Job[] = scheduledJobs(jobDocs).filter((job) => visibleOnCalendar(job.doc, filter));
  const skipTentative = ignoresTentative(filter);
  const clashList = allConflicts(jobDocs);
  const clashing = new Set(clashList.filter((c) => !c.tentative).flatMap((c) => [c.docId, c.otherDocId]));
  const softClashing = new Set(clashList.filter((c) => c.tentative).flatMap((c) => [c.docId, c.otherDocId]).filter((id) => !clashing.has(id))); // R127
  const unscheduled = jobDocs.filter((doc) => !readSchedule(doc.data) && text(doc.data?.status) !== "paid");

  async function save(docId: string, schedule: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) {
    try {
      await saveSchedule(docId, schedule, options?.confirmed);
      setState((prev) => ({ ...prev, docs: readDocs() }));
      setMessage(schedule ? "Schedule saved" : "Job unscheduled");
    } catch {
      setMessage("Could not save the schedule.");
    }
    if (!options?.keepOpen) setEditing(null);
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
    if (isT(js) && isT(je) && je > js) return moveSchedule({ ...base, startTime: js, endTime: je }, date, start);
    return base;
  }

  const toMin = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

  function dropOn(date: string, startTime?: string) {
    return async (event: React.DragEvent) => {
      event.preventDefault();
      const docId = event.dataTransfer.getData("text/plain");
      const doc = docs.find((item) => item.id === docId);
      if (!doc) return;
      const existing = readSchedule(doc.data);
      const next = existing
        ? moveSchedule(existing, date, startTime)
        : unscheduledDrop(doc.data, date, startTime);
      // Same double-booking check as the schedule editor: offer the next open time, else Book anyway (recorded).
      // R127: an approved job there blocks (below); a pending/draft one only warns, with a move option.
      const { hard: clash, soft } = splitConflicts(bookingConflicts(docs, docId, next));
      const softLen = next.startTime ? (next.endTime && next.endTime > next.startTime ? toMin(next.endTime) - toMin(next.startTime) : 60) : 60;
      if (!clash.length && soft.length) {
        const who = soft.map((c) => `${workerName.get(c.workerId) || "Worker"} on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("\n");
        const slot = nextOpenSlot(docs, docId, date, next.workerIds, softLen, next.startTime ? toMin(next.startTime) : undefined, { ignoreTentative: skipTentative });
        if (slot && slot !== next.startTime && window.confirm(`A pending proposal holds this time (not approved yet):\n${who}\n\nMove it to the next open time, ${clockText(toMin(slot))}? Cancel keeps it here.`)) {
          setConflictNote({ state: "moved", text: `Moved to the next open time, ${clockText(toMin(slot))}.` });
          return save(docId, moveSchedule(next, date, slot));
        }
        setConflictNote({ state: "soft", text: "Saved. A pending proposal also holds this time (not approved yet)." });
        return save(docId, next);
      }
      if (clash.length) {
        const who = clash.map((c) => `${workerName.get(c.workerId) || "Worker"} is already on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`).join("\n");
        const length = next.startTime ? (next.endTime && next.endTime > next.startTime ? toMin(next.endTime) - toMin(next.startTime) : 60) : 60;
        const slot = nextOpenSlot(docs, docId, date, next.workerIds, length, next.startTime ? toMin(next.startTime) : undefined, { ignoreTentative: skipTentative }) || nextOpenSlot(docs, docId, date, next.workerIds, length, undefined, { ignoreTentative: skipTentative });
        if (slot && window.confirm(`Double-booked:\n${who}\n\nMove it to the next open time, ${clockText(toMin(slot))}, instead?`)) {
          const moved = moveSchedule(next, date, slot);
          setConflictNote({ state: "moved", text: `Moved to the next open time, ${clockText(toMin(slot))}.` });
          return save(docId, moved);
        }
        if (!window.confirm(`Book anyway?\n${who}\n\nThey'll be on two jobs at once. This is saved on the job. Cancel keeps it where it was.`)) {
          setConflictNote({ state: "blocked", text: "Not moved: someone on this job is already booked then." });
          return;
        }
        const at = new Date().toISOString();
        setConflictNote({ state: "override", text: "Booked anyway. Saved on the job." });
        return save(docId, { ...next, overrides: [...readOverrides(next.overrides), ...clash.map((c) => ({ workerId: c.workerId, otherDocId: c.docId, at }))] });
      }
      setConflictNote(null);
      await save(docId, next);
    };
  }

  function chip(job: Job, compact = false, agenda = false) {
    const tid = agenda ? "agenda-" : "";
    const people = job.schedule.workerIds.map((id) => workerName.get(id)).filter(Boolean).join(", ");
    return (
      <div
        key={job.doc.id}
        draggable
        data-testid={`${tid}job-${job.doc.id}`}
        data-status={job.schedule.status}
        data-tentative={isTentative(job.doc) || undefined}
        data-state={clashing.has(job.doc.id) ? "blocked" : undefined}
        data-done={doneState(job.schedule) || undefined}
        onDragStart={(event) => event.dataTransfer.setData("text/plain", job.doc.id)}
        onClick={(event) => { event.stopPropagation(); setEditing({ docId: job.doc.id }); }}
        className={agenda ? `flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border border-l-4 px-3 py-2 text-left text-sm font-medium leading-snug shadow-sm ${statusClass(job.schedule)}${isTentative(job.doc) ? " cr-tentative border-dashed opacity-60" : ""}` : `cr-chip2 cursor-grab min-w-0 break-words rounded-md border border-l-4 px-1.5 py-1 text-left text-xs font-medium leading-snug shadow-sm ${statusClass(job.schedule)}${isTentative(job.doc) ? " cr-tentative border-dashed opacity-60" : ""}`}
        title={`${job.doc.title} · ${job.doc.clientName} · ${statusLabel(job.schedule)}${job.schedule.onMyWayAt && job.schedule.status !== "done" ? ` · ${job.schedule.onMyWayBy || "Crew"} on the way` : ""}${people ? ` · ${people}` : ""}`}
      >
        {agenda ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-semibold tabular-nums">{job.schedule.startTime ? timeLabel(job.schedule.startTime) : "Any time"}</span>
            <span className="min-w-0 truncate">{job.doc.title}{job.doc.clientName ? <span className="opacity-80"> · {job.doc.clientName}</span> : null}</span>
          </span>
        ) : (
          <>
            {job.schedule.startTime && <span className="font-semibold">{timeLabel(job.schedule.startTime)} </span>}
            {job.doc.clientName || job.doc.title}
          </>
        )}
        {isTentative(job.doc) && <span data-testid="not-approved-tag" className="mt-0.5 inline-block rounded border border-dashed border-current px-1 text-[10px] font-semibold uppercase tracking-wide">Not approved</span>}
        {!compact && people && <span className="block truncate opacity-80">{people}</span>}
        {compact && softClashing.has(job.doc.id) && <span data-testid="overlap-dot" data-soft="true" title="A job that isn't approved yet holds this time" className="block text-amber-700/80 dark:text-amber-300/80">Pending overlap</span>}
        {compact && clashing.has(job.doc.id) && <span data-testid="overlap-dot" title="Overlap: same worker on another job at this time" className="block font-semibold text-amber-700 dark:text-amber-300">⚠ Overlap</span>}
        {!compact && (clashing.has(job.doc.id) || softClashing.has(job.doc.id)) && <span className="block" onClick={(event) => event.stopPropagation()}><OverlapBadge docs={docs} doc={job.doc} onMoved={() => setState((prev) => ({ ...prev, docs: readDocs() }))} /></span>}
        {job.schedule.onMyWayAt && job.schedule.status !== "done" && <span className="block truncate opacity-80" data-testid={`${tid}omw`}>🚗 {compact ? "On way" : `On the way · ${omwTime(job.schedule.onMyWayAt)}`}</span>}
        {doneState(job.schedule) === "awaiting" && <span className="block truncate opacity-80" data-testid={`${tid}done-awaiting`}>{compact ? "To confirm" : DONE_LABEL.awaiting}</span>}
        {!compact && doneState(job.schedule) === "confirmed" && <span className="block truncate opacity-80">{DONE_LABEL.confirmed}</span>}
      </div>
    );
  }

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
      <PageHeader title="Calendar" subtitle={<><span className="hidden sm:inline">Drag jobs onto the week or month. Click a slot or job to edit it.</span><span className="sm:hidden">Tap a slot or job to edit it.</span></>} actions={<a href="/invoice?visit=1#schedule" data-testid="calendar-new-job" className="rounded-xl bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">New job</a>} />
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
              <div className="hidden min-w-0 grid-cols-[3rem_repeat(7,minmax(0,1fr))] text-xs min-[900px]:grid" data-testid="week-grid">
                <div />
                {weekDays.map((day) => (
                  <div key={day} className={`border-b border-slate-500/30 px-2 py-2.5 text-center text-sm font-semibold ${day === today ? "rounded-t-lg bg-teal-500/15 text-teal-600 dark:text-teal-300" : ""}`}>
                    {DAY_NAMES[parse(day).getDay()]} {parse(day).getDate()}
                  </div>
                ))}
                <div className="p-1.5 pr-2 text-right text-[11px] font-medium uppercase tracking-wide opacity-70">Any</div>
                {weekDays.map((day) => (
                  <div key={`any-${day}`} data-testid={`slot-${day}-any`} onDragOver={(event) => event.preventDefault()} onDrop={dropOn(day, "")} className={`min-h-10 space-y-1 border-b border-l border-slate-500/20 bg-slate-500/5 p-1 ${day === today ? "bg-teal-500/10" : ""}`}>
                    {jobs.filter((job) => job.schedule.date === day && !job.schedule.startTime).map((job) => chip(job, true))}
                  </div>
                ))}
                {HOURS.map((hour) => (
                  <div key={hour} className="contents">
                    <div className="-mt-2 p-1.5 pr-2 text-right text-[11px] font-medium tabular-nums opacity-70">{timeLabel(`${String(hour).padStart(2, "0")}:00`)}</div>
                    {weekDays.map((day) => {
                      const slot = `${String(hour).padStart(2, "0")}:00`;
                      const here = jobs.filter((job) => job.schedule.date === day && job.schedule.startTime && Number(job.schedule.startTime.slice(0, 2)) === hour);
                      return (
                        <div
                          key={`${day}-${hour}`}
                          data-testid={`slot-${day}-${String(hour).padStart(2, "0")}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={dropOn(day, slot)}
                          onClick={() => unscheduled.length ? setEditing({ docId: unscheduled[0].id, date: day, startTime: slot }) : setMessage("Every job is scheduled. Click a job to change it.")}
                          className={`min-h-12 space-y-1 border-b border-l border-slate-500/20 p-1 transition hover:bg-teal-500/10 ${day === today ? "bg-teal-500/10" : ""}`}
                        >
                          {here.map((job) => chip(job))}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {(() => {
                  const outside = jobs.filter((job) => weekDays.includes(job.schedule.date) && job.schedule.startTime && (Number(job.schedule.startTime.slice(0, 2)) < HOURS[0] || Number(job.schedule.startTime.slice(0, 2)) > HOURS[HOURS.length - 1]));
                  return outside.length ? <div className="col-span-8 p-1 opacity-80">Outside 6am–8pm: {outside.map((job) => chip(job, true))}</div> : null;
                })()}
              </div>
            )}


            {(view === "week" || view === "month") && (() => {
              const days = (view === "week" ? weekDays : monthCells.filter((day): day is string => Boolean(day)))
                .filter((day) => view === "week" || day === today || jobs.some((job) => job.schedule.date === day) || docs.some((doc) => doc.type === "invoice" && doc.data?.dueDate === day && text(doc.data?.status) !== "paid"));
              return (
                <div className="space-y-3 min-[900px]:hidden" data-testid="agenda-list">
                  {days.length === 0 && <p className="py-8 text-center text-sm text-[var(--cr-muted)]">No jobs this month.</p>}
                  {days.map((day) => {
                    const dayJobs = jobs.filter((job) => job.schedule.date === day).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime));
                    const due = view === "month" ? docs.filter((doc) => doc.type === "invoice" && doc.data?.dueDate === day && text(doc.data?.status) !== "paid") : [];
                    return (
                      <section key={day} data-testid={`agenda-day-${day}`}>
                        <h2 className={`sticky top-[env(safe-area-inset-top)] z-10 -mx-2 mb-1.5 max-sm:mx-0 max-sm:rounded-lg max-sm:border max-sm:border-teal-500/15 flex items-center gap-2 px-3 py-2 text-sm font-semibold backdrop-blur sm:-mx-3 ${day === today ? "bg-teal-500/15 text-teal-700 dark:text-teal-300" : "bg-[var(--cr-card)]/95"}`}>
                          <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs tabular-nums ${day === today ? "bg-teal-500 text-slate-950!" : "bg-slate-500/10"}`}>{parse(day).getDate()}</span>
                          {parse(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                          {day === today && <span className="ml-auto text-xs font-semibold uppercase tracking-wide">Today</span>}
                        </h2>
                        <div className="space-y-1.5">
                          {dayJobs.map((job) => chip(job, false, true))}
                          {due.map((doc) => (
                            <a key={`agenda-due-${doc.id}`} href={`/invoice-view?id=${encodeURIComponent(doc.id)}`} className="flex min-h-11 items-center rounded-lg border border-dashed border-slate-500/30 px-3 text-sm text-[var(--cr-muted)]" data-testid={`agenda-due-${doc.id}`}>Due: {doc.title}</a>
                          ))}
                          {dayJobs.length === 0 && due.length === 0 && <p className="px-3 py-2 text-sm text-[var(--cr-muted)]">No jobs</p>}
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
                      onClick={() => day && unscheduled.length && setEditing({ docId: unscheduled[0].id, date: day })}
                      className={`min-h-28 rounded-xl border p-1.5 text-xs transition hover:bg-teal-500/5 ${day ? "border-slate-500/25 bg-[var(--cr-bg)]" : "border-transparent"} ${day === today ? "ring-2 ring-teal-400" : ""}`}
                    >
                      {day && <div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${day === today ? "bg-teal-500 text-slate-950!" : ""}`}>{parse(day).getDate()}</div>}
                      <div className="space-y-0.5">
                        {day && jobs.filter((job) => job.schedule.date === day).sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime)).map((job) => chip(job, true))}
                        {day && docs.filter((doc) => doc.type === "invoice" && doc.data?.dueDate === day && text(doc.data?.status) !== "paid").map((doc) => (
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

          <aside className="h-fit rounded-2xl border border-slate-500/30 bg-[var(--cr-card)] p-4 text-sm shadow-sm lg:sticky lg:top-20 print:hidden" data-testid="unscheduled">
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
                  onClick={() => setEditing({ docId: doc.id, date: current })}
                  className="flex min-h-11 cursor-grab items-center truncate rounded-lg border border-slate-500/40 px-3 text-xs font-medium transition hover:border-teal-400 hover:bg-teal-500/5"
                >
                  {doc.title} · {doc.clientName || "No client"}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
