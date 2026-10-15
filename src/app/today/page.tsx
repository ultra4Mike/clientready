"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { uniqueDocs } from "@/lib/change-orders";
import { confirmJobDone, doneState, readWorkers, saveSchedule, statusLabel, type Schedule } from "@/lib/schedule";
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
    const saved = await confirmJobDone(docId).catch(() => null);
    setMessage(saved ? "Job confirmed done." : "Could not confirm. Try again.");
    read();
    setBusy("");
  }

  const state = !loaded ? "loading" : jobs.length ? "ready" : "empty";
  return (
    <AppShell title="Today">
      <section className="py-2 sm:py-4" data-testid="today" data-state={state}>
        <PageHeader title="Today" subtitle={today ? niceYmd(today) : "Loading…"} actions={<a href="/calendar" className="text-sm underline">Calendar</a>} />
        {message && <p className="mb-3 text-sm" role="status" data-testid="today-message">{message}</p>}
        {state === "loading" && <p className="text-sm text-[var(--cr-muted)]">Loading…</p>}
        {state === "empty" && <p className="text-sm text-[var(--cr-muted)]" data-testid="today-empty">No jobs scheduled today.</p>}
        <ol className="space-y-3">
          {jobs.map(({ doc, schedule }) => {
            const phone = text(doc.data?.clientPhone);
            const address = text(doc.data?.clientAddress);
            const done = doneState(schedule);
            const people = schedule.workerIds.map((id) => workers.get(id)).filter(Boolean).join(", ");
            return (
              <li key={doc.id} data-testid="today-job" data-doc-id={doc.id} data-time={schedule.startTime || ""} data-status={schedule.status} data-done={done || undefined} className="rounded-xl border border-teal-500/20 p-4 text-sm">
                <p className="font-semibold">
                  <span data-testid="today-time">{schedule.startTime ? timeLabel(schedule.startTime) : "Any time"}{schedule.endTime ? ` – ${timeLabel(schedule.endTime)}` : ""}</span>
                  {" · "}
                  <a href={`/invoice?id=${encodeURIComponent(doc.id)}`} className="underline-offset-2 hover:underline">{text(doc.data?.clientName) || doc.clientName || doc.title}</a>
                </p>
                <p className="text-xs text-[var(--cr-muted)]" data-testid="today-status">{statusLabel(schedule)} · {doc.title}{people ? ` · ${people}` : ""}</p>
                {address && <p data-testid="today-address">{address}</p>}
                {phone && <p><a href={`tel:${phone.replace(/[^\d+]/g, "")}`} data-testid="today-phone" className="underline">{phone}</a></p>}
                {schedule.crewNote && <p className="text-xs text-[var(--cr-muted)]">Crew note: {schedule.crewNote}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {schedule.status === "scheduled" && <button type="button" disabled={busy === doc.id} data-testid="today-start" onClick={() => setStatus(doc.id, schedule, "in_progress")} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium">Start</button>}
                  {schedule.status !== "done" && <button type="button" disabled={busy === doc.id} data-testid="today-complete" onClick={() => setStatus(doc.id, schedule, "done")} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium">Complete</button>}
                  {done === "awaiting" && <button type="button" disabled={busy === doc.id} data-testid="today-confirm" onClick={() => confirm(doc.id)} className="rounded-lg border border-teal-500/30 px-3 py-1.5 text-sm font-medium">Confirm done</button>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </AppShell>
  );
}
