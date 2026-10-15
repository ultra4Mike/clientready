"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ScheduleEditor from "@/components/ScheduleEditor";
import { uniqueDocs } from "@/lib/change-orders";
import { moveSchedule, readSchedule, readWorkers, saveSchedule, STATUS_CLASS, STATUS_LABEL, type JobStatus, type Schedule, type Worker } from "@/lib/schedule";

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

export default function CalendarPage() {
  const [state, setState] = useState<{ docs: SavedDocument[]; workers: Worker[]; today: string }>({ docs: [], workers: [], today: "" });
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [workerId, setWorkerId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setState({ docs: readDocs(), workers: readWorkers(), today: ymd(new Date()) });
  }, []);

  const { docs, workers, today } = state;
  const current = anchor || today;
  const workerName = useMemo(() => new Map(workers.map((person) => [person.id, person.name])), [workers]);

  const jobDocs = docs.filter((doc) => doc.type === "invoice" || doc.type === "proposal");
  const jobs: Job[] = jobDocs.flatMap((doc) => {
    const schedule = readSchedule(doc.data);
    return schedule ? [{ doc, schedule }] : [];
  });
  const unscheduled = jobDocs.filter((doc) => !readSchedule(doc.data) && text(doc.data?.status) !== "paid");

  async function save(docId: string, schedule: Schedule | null) {
    try {
      await saveSchedule(docId, schedule);
      setState((prev) => ({ ...prev, docs: readDocs() }));
      setMessage(schedule ? "Schedule saved" : "Job unscheduled");
    } catch {
      setMessage("Could not save the schedule.");
    }
    setEditing(null);
  }

  function dropOn(date: string, startTime?: string) {
    return async (event: React.DragEvent) => {
      event.preventDefault();
      const docId = event.dataTransfer.getData("text/plain");
      const doc = docs.find((item) => item.id === docId);
      if (!doc) return;
      const existing = readSchedule(doc.data);
      const next = existing
        ? moveSchedule(existing, date, startTime)
        : { date, startTime: startTime || "", workerIds: [], status: "scheduled" as JobStatus, updatedAt: "" };
      await save(docId, next);
    };
  }

  function chip(job: Job, compact = false) {
    const people = job.schedule.workerIds.map((id) => workerName.get(id)).filter(Boolean).join(", ");
    return (
      <div
        key={job.doc.id}
        draggable
        data-testid={`job-${job.doc.id}`}
        data-status={job.schedule.status}
        onDragStart={(event) => event.dataTransfer.setData("text/plain", job.doc.id)}
        onClick={(event) => { event.stopPropagation(); setEditing({ docId: job.doc.id }); }}
        className={`cursor-grab truncate rounded border px-1 py-0.5 text-left text-xs ${STATUS_CLASS[job.schedule.status]}`}
        title={`${job.doc.title} · ${job.doc.clientName} · ${STATUS_LABEL[job.schedule.status]}${people ? ` · ${people}` : ""}`}
      >
        {job.schedule.startTime && <span className="font-semibold">{timeLabel(job.schedule.startTime)} </span>}
        {job.doc.clientName || job.doc.title}
        {!compact && people && <span className="block truncate opacity-80">{people}</span>}
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
      <section className="mx-auto max-w-7xl py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1" role="tablist">
            {(["week", "month", "worker"] as View[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={`rounded-lg border px-3 py-1.5 text-sm ${view === item ? "border-teal-400 text-teal-300" : "border-slate-500/40"}`}>
                {item === "week" ? "Week" : item === "month" ? "Month" : "By worker"}
              </button>
            ))}
          </div>
          {view !== "worker" && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => shift(-1)}>Previous</button>
              <h1 className="text-lg font-semibold" data-testid="calendar-heading">{heading}</h1>
              <button type="button" onClick={() => shift(1)}>Next</button>
              <button type="button" onClick={() => setAnchor(today)} className="text-sm underline">Today</button>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => <span key={key} className={`rounded border px-2 py-0.5 ${STATUS_CLASS[key]}`}>{STATUS_LABEL[key]}</span>)}
          <span className="opacity-70">Drag a job to move it. Click a slot or job to edit.</span>
        </div>
        {message && <p className="mt-2 text-sm" data-testid="calendar-message">{message}</p>}

        {editing && editingDoc && (
          <div className="mt-4 rounded-2xl border border-teal-500/30 bg-[var(--cr-card)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{editingDoc.title} · {editingDoc.clientName}</p>
              <a href={`/invoice?id=${encodeURIComponent(editingDoc.id)}`} className="text-sm underline">Open {editingDoc.type}</a>
            </div>
            {!readSchedule(editingDoc.data) && (
              <label className="mb-3 flex flex-col gap-1 text-sm">Job
                <select aria-label="Job to schedule" value={editing.docId} onChange={(event) => setEditing({ ...editing, docId: event.target.value })} className="rounded border border-slate-300 bg-transparent px-2 py-1">
                  {unscheduled.map((doc) => <option key={doc.id} value={doc.id}>{doc.title} · {doc.clientName}</option>)}
                </select>
              </label>
            )}
            <ScheduleEditor
              key={`${editing.docId}-${editing.date || ""}-${editing.startTime || ""}`}
              value={readSchedule(editingDoc.data)}
              workers={workers}
              defaults={{ date: editing.date, startTime: editing.startTime }}
              onSave={(schedule) => save(editing.docId, schedule)}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_14rem]">
          <div className="min-w-0 overflow-x-auto">
            {view === "week" && (
              <div className="grid min-w-[44rem] grid-cols-[3rem_repeat(7,minmax(0,1fr))] text-xs" data-testid="week-grid">
                <div />
                {weekDays.map((day) => (
                  <div key={day} className={`border-b border-slate-500/30 p-1 text-center font-medium ${day === today ? "text-teal-300" : ""}`}>
                    {DAY_NAMES[parse(day).getDay()]} {parse(day).getDate()}
                  </div>
                ))}
                <div className="p-1 text-right opacity-60">Any</div>
                {weekDays.map((day) => (
                  <div key={`any-${day}`} data-testid={`slot-${day}-any`} onDragOver={(event) => event.preventDefault()} onDrop={dropOn(day, "")} className="min-h-8 space-y-0.5 border-b border-l border-slate-500/20 p-0.5">
                    {jobs.filter((job) => job.schedule.date === day && !job.schedule.startTime).map((job) => chip(job, true))}
                  </div>
                ))}
                {HOURS.map((hour) => (
                  <div key={hour} className="contents">
                    <div className="p-1 text-right opacity-60">{timeLabel(`${String(hour).padStart(2, "0")}:00`)}</div>
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
                          className="min-h-10 space-y-0.5 border-b border-l border-slate-500/20 p-0.5 hover:bg-teal-500/5"
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

            {view === "month" && (
              <div data-testid="month-grid">
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium opacity-70">{DAY_NAMES.map((name) => <div key={name}>{name}</div>)}</div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {monthCells.map((day, index) => (
                    <div
                      key={day || `blank-${index}`}
                      data-testid={day ? `day-${day}` : undefined}
                      onDragOver={(event) => day && event.preventDefault()}
                      onDrop={day ? dropOn(day) : undefined}
                      onClick={() => day && unscheduled.length && setEditing({ docId: unscheduled[0].id, date: day })}
                      className={`min-h-24 rounded-lg border p-1 text-xs ${day ? "border-slate-500/30" : "border-transparent"} ${day === today ? "ring-1 ring-teal-400" : ""}`}
                    >
                      {day && <div className="font-medium">{parse(day).getDate()}</div>}
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
                <label className="flex flex-col gap-1 text-sm">Worker
                  <select aria-label="Worker" value={workerId} onChange={(event) => setWorkerId(event.target.value)} className="max-w-xs rounded border border-slate-500/40 bg-transparent px-2 py-1">
                    <option value="">Pick a worker</option>
                    {workers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
                {workerId && workerJobs.length === 0 && <p className="text-sm opacity-70">No jobs assigned.</p>}
                {workerJobs.map((job) => (
                  <div key={job.doc.id} className="rounded-xl border border-slate-500/30 p-3 text-sm" data-testid={`worker-job-${job.doc.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{text(job.doc.data?.clientName) || job.doc.clientName} · {job.doc.title}</p>
                      <select aria-label="Status" value={job.schedule.status} onChange={(event) => save(job.doc.id, { ...job.schedule, status: event.target.value as JobStatus })} className={`rounded border px-2 py-0.5 text-xs ${STATUS_CLASS[job.schedule.status]}`}>
                        {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => <option key={key} value={key}>{STATUS_LABEL[key]}</option>)}
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

          <aside className="rounded-2xl border border-slate-500/30 p-3 text-sm" data-testid="unscheduled">
            <p className="font-semibold">Unscheduled jobs</p>
            <p className="mb-2 text-xs opacity-70">Drag onto the calendar, or click to set a time.</p>
            {unscheduled.length === 0 && <p className="text-xs opacity-70">None.</p>}
            <div className="space-y-1">
              {unscheduled.map((doc) => (
                <div
                  key={doc.id}
                  draggable
                  data-testid={`unscheduled-${doc.id}`}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", doc.id)}
                  onClick={() => setEditing({ docId: doc.id, date: current })}
                  className="cursor-grab truncate rounded border border-slate-500/40 px-2 py-1 text-xs"
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
