"use client";

import OverlapBadge from "@/components/OverlapBadge";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import FollowUps from "@/components/FollowUps";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { clientOptedOut, reviewAskedAt } from "@/lib/review-request";
import { uniqueDocs } from "@/lib/change-orders";
import { confirmJobDone, doneState, omwTime, onMyWaySmsHref, readWorkers, saveSchedule, statusLabel, type Schedule } from "@/lib/schedule";
import { localYmd, niceYmd, scheduledJobs, timeLabel } from "@/lib/scheduled-jobs";

type Doc = { id: string; type: string; title: string; clientName: string; createdAt: string; data: Record<string, unknown> };
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Owner: today's scheduled jobs in time order with the same start / complete / confirm actions as the
 * calendar. Crew accounts are sent to /crew by AppShell. Never touches money or invoice status.
 */
export default function TodayPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [workers, setWorkers] = useState<Map<string, string>>(new Map());
  const [today, setToday] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const read = () => {
    const raw = window.localStorage.getItem("clientready-documents");
    setDocs(raw ? uniqueDocs(JSON.parse(raw) as Doc[]) : []);
    setWorkers(new Map(readWorkers().map((person) => [person.id, person.name])));
  };

  useEffect(() => {
    const day = localYmd();
    // Speed audit #1: cached jobs first, then refresh from the server.
    try { read(); setToday(day); if (window.localStorage.getItem("clientready-documents")) setLoaded(true); } catch { /* bad cache: wait for the server */ }
    loadAccountIntoCache()
      .catch(() => false)
      .then(() => {
        read();
        setToday(day);
        setLoaded(true);
      });
  }, []);

  const jobs = today ? scheduledJobs(docs).filter((job) => job.schedule.date === today) : [];
  // "Any time" jobs (no start time) go after timed jobs.
  jobs.sort((a, b) => (a.schedule.startTime || "99:99").localeCompare(b.schedule.startTime || "99:99"));

  async function setStatus(docId: string, schedule: Schedule, status: Schedule["status"]) {
    setBusy(docId);
    try {
      await saveSchedule(docId, { ...schedule, status });
      setMessage(status === "in_progress" ? "Job started." : "Job marked done.");
    } catch {
      setMessage("Could not save. Try again.");
    }
    read();
    setBusy("");
  }

  async function confirm(docId: string) {
    setBusy(docId);
    setMessage("Job confirmed done."); // R110: say it now; correct it if the save fails
    const saved = await confirmJobDone(docId).catch(() => null);
    if (!saved) setMessage("Could not confirm. Try again.");
    read();
    setBusy("");
  }

  const state = !loaded ? "loading" : jobs.length ? "ready" : "empty";
  return (
    <AppShell title="Today">
      <section className="py-2 sm:py-4" data-testid="today" data-state={state}>
        <PageHeader title="Today" subtitle={today ? niceYmd(today) : "Loading…"} actions={<span className="flex gap-2"><a href="/route" data-testid="today-route" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"><span aria-hidden="true">🗺️</span>Route</a><a href="/calendar" className="inline-flex min-h-11 items-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium transition hover:border-teal-400 sm:min-h-10">Calendar</a></span>} />
        {message && <p className="mb-3 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm" role="status" data-testid="today-message">{message}</p>}
        {state === "loading" && <div className="space-y-3" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-teal-500/10" />)}<p className="sr-only">Loading…</p></div>}
        {state === "empty" && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-12 text-center">
            <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-xl">☀️</span>
            <p className="text-base font-semibold" data-testid="today-empty">No jobs scheduled today.</p>
            <a href="/calendar" className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium">Open calendar</a>
          </div>
        )}
        <ol className="space-y-3">
          {jobs.map(({ doc, schedule }) => {
            const phone = text(doc.data?.clientPhone);
            const address = text(doc.data?.clientAddress);
            const done = doneState(schedule);
            const people = schedule.workerIds.map((id) => workers.get(id)).filter(Boolean).join(", ");
            const tone = schedule.status === "done" ? (done === "awaiting" ? "border-l-amber-400" : "border-l-emerald-500") : schedule.status === "in_progress" ? "border-l-sky-400" : "border-l-teal-500";
            return (
              <li key={doc.id} data-testid="today-job" data-doc-id={doc.id} data-time={schedule.startTime || ""} data-status={schedule.status} data-done={done || undefined} className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-l-4 border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm shadow-sm sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-5 sm:p-5 ${tone}`}>
                <div className="font-semibold tabular-nums leading-tight">
                  <span data-testid="today-time">{schedule.startTime ? timeLabel(schedule.startTime) : "Any time"}{schedule.endTime ? ` – ${timeLabel(schedule.endTime)}` : ""}</span>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-semibold">
                    <a href={`/invoice?id=${encodeURIComponent(doc.id)}`} className="underline-offset-2 hover:underline">{text(doc.data?.clientName) || doc.clientName || doc.title}</a>
                  </p>
                  <OverlapBadge docs={docs} doc={doc} onMoved={read} />
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--cr-muted)]" data-testid="today-status"><span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${schedule.status === "done" ? (done === "awaiting" ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300") : schedule.status === "in_progress" ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300"}`}>{statusLabel(schedule)}</span><span className="min-w-0 break-words"><span className="whitespace-nowrap">{doc.title}</span>{people ? ` · ${people}` : ""}</span></p>
                  {schedule.checklist && schedule.checklist.length > 0 && (
                    <p className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${schedule.checklist.every((item) => item.done) ? "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800" : "cr-tone-warn border-amber-300 bg-amber-50 text-amber-900"}`} data-testid="today-checklist"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>Checklist {schedule.checklist.filter((item) => item.done).length}/{schedule.checklist.length}</p>
                  )}
                  {schedule.onMyWayAt && schedule.status !== "done" && (
                    <p className="text-xs font-semibold text-sky-700 dark:text-sky-300" data-testid="today-omw">🚗 {schedule.onMyWayBy || "Crew"} on the way · {omwTime(schedule.onMyWayAt)}
                      {phone && onMyWaySmsHref(phone, text(doc.data?.clientName) || doc.clientName, schedule.onMyWayBy || "") && <> · <a href={onMyWaySmsHref(phone, text(doc.data?.clientName) || doc.clientName, schedule.onMyWayBy || "")} data-testid="today-omw-text" className="underline">Text customer</a></>}
                    </p>
                  )}
                  {address && <p className="break-words" data-testid="today-address">{address}</p>}
                  {phone && <p><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} data-testid="today-phone" className="underline">{phone}</a></p>}
                  {schedule.crewNote && <p className="rounded-lg bg-teal-500/5 px-2 py-1 text-xs text-[var(--cr-muted)]">Crew note: {schedule.crewNote}</p>}
                  <div className="grid grid-cols-2 gap-2 pt-2 sm:flex sm:flex-wrap">
                    {phone && <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 border border-teal-500/30 hover:border-teal-400">Call</a>}
                    {address && <a href={`https://maps.google.com/?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 border border-teal-500/30 hover:border-teal-400">Map</a>}
                    {schedule.status === "scheduled" && <button type="button" disabled={busy === doc.id} data-testid="today-start" onClick={() => setStatus(doc.id, schedule, "in_progress")} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 border border-teal-500/30 hover:border-teal-400">Start</button>}
                    {schedule.status !== "done" && <button type="button" disabled={busy === doc.id} data-testid="today-complete" onClick={() => setStatus(doc.id, schedule, "done")} className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 bg-teal-500 text-slate-950! hover:bg-teal-400">Complete</button>}
                    {schedule.status === "done" && done !== "awaiting" && !reviewAskedAt(doc.id) && !clientOptedOut(String(doc.data?.clientId || ""), String(doc.clientName || "")) && <a href={`/invoice?id=${encodeURIComponent(doc.id)}#review-request`} data-testid="today-review" className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-4 text-sm font-semibold transition hover:border-teal-400">Ask for a review</a>}
                    {done === "awaiting" && <button type="button" disabled={busy === doc.id} data-testid="today-confirm" onClick={() => confirm(doc.id)} className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 bg-teal-500 text-slate-950! hover:bg-teal-400">Confirm done</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <FollowUps docs={docs} today={today} />
      </section>
    </AppShell>
  );
}
