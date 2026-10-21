"use client";

import { useEffect, useState } from "react";
import { readWorkers } from "@/lib/schedule";
import { localYmd } from "@/lib/scheduled-jobs";
import { todayJobsWithCrew, type TodayJob } from "@/lib/today-jobs";

/** Redesign 1: today's jobs and who is on each, from the one schedule. Links to the job page. */
export default function TodayJobsBlock({ docs, loaded }: { docs: { id: string; type: string; title: string; clientName?: string; data?: Record<string, unknown> }[]; loaded: boolean }) {
  const [jobs, setJobs] = useState<TodayJob[]>([]);
  useEffect(() => {
    setJobs(todayJobsWithCrew(docs, new Map(readWorkers().map((w) => [w.id, w.name])), localYmd()));
  }, [docs]);
  return (
    <section data-testid="dash-today" data-count={jobs.length} className="cr-panel rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Today</h2>
        <a href="/calendar?view=day" data-testid="dash-today-all" className="inline-flex min-h-11 items-center text-xs font-medium underline">Open day view</a>
      </div>
      {!loaded ? <p className="mt-2 text-[var(--cr-muted)]">…</p> : jobs.length === 0 ? <p data-testid="dash-today-empty" className="mt-2 text-[var(--cr-muted)]">No jobs scheduled today.</p> : (
        <ul className="mt-2 divide-y divide-teal-500/10">
          {jobs.map((job) => (
            <li key={job.docId} data-testid="dash-today-job" data-doc-id={job.docId} className="py-2">
              <a href={`/job?id=${encodeURIComponent(job.docId)}`} className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium"><span data-testid="dash-today-time">{job.start ? `${job.start}${job.end ? `–${job.end}` : ""}` : "Any time"}</span> · {job.client || job.title}</span>
                <span data-testid="dash-today-status" className="text-xs text-[var(--cr-muted)]">{job.status}</span>
              </a>
              <p data-testid="dash-today-crew" className="text-xs text-[var(--cr-muted)]">{job.crew.length ? job.crew.map((c) => c.name).join(", ") : "No crew assigned"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
