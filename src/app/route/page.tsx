"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/EmptyState";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { uniqueDocs } from "@/lib/change-orders";
import { readWorkers, STATUS_LABEL, type Worker } from "@/lib/schedule";
import { addDaysYmd, localYmd, niceYmd, timeLabel } from "@/lib/scheduled-jobs";
import { dayRoute } from "@/lib/route";

type Doc = { id: string; type: string; title: string; clientName: string; data: Record<string, unknown> };

/** Owner: one day's stops in order with a map and one Maps directions link. Read-only. */
export default function RoutePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [date, setDate] = useState("");
  const [worker, setWorker] = useState("all");
  const [showMap, setShowMap] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const day = new URLSearchParams(window.location.search).get("date");
    loadAccountIntoCache().catch(() => false).then(() => {
      const raw = window.localStorage.getItem("clientready-documents");
      setDocs(raw ? uniqueDocs(JSON.parse(raw) as Doc[]).filter((doc) => !(doc as { deleted?: boolean }).deleted) : []);
      setWorkers(readWorkers());
      setDate(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : localYmd());
      setLoaded(true);
    });
  }, []);

  const route = useMemo(() => (date ? dayRoute(docs, date, worker) : null), [docs, date, worker]);
  const names = new Map(workers.map((person) => [person.id, person.name]));
  const button = "inline-flex min-h-11 items-center rounded-xl border border-teal-500/30 px-3 text-sm font-medium";

  return (
    <AppShell title="Route">
      <PageHeader title="Route" subtitle="The day's stops in order, with directions." />
      <div className="space-y-4" data-testid="route" data-date={date}>
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 sm:flex sm:flex-wrap">
          <button type="button" className={`${button} justify-center px-0 sm:w-11`} data-testid="route-prev" onClick={() => { setDate(addDaysYmd(date, -1)); setShowMap(false); }} aria-label="Previous day">←</button>
          <input type="date" className={`${button} w-full bg-transparent text-center text-base font-semibold sm:w-auto sm:text-sm`} data-testid="route-date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setShowMap(false); } }} />
          <button type="button" className={`${button} justify-center px-0 sm:w-11`} data-testid="route-next" onClick={() => { setDate(addDaysYmd(date, 1)); setShowMap(false); }} aria-label="Next day">→</button>
          {workers.length > 0 && (
            <select className={`${button} col-span-3 w-full bg-transparent text-base sm:w-auto sm:text-sm`} data-testid="route-worker" value={worker} onChange={(event) => setWorker(event.target.value)}>
              <option value="all">Everyone</option>
              {workers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          )}
        </div>
        {date && <h2 className="text-lg font-semibold">{niceYmd(date)}</h2>}
        {!loaded && <div className="h-28 animate-pulse rounded-2xl bg-teal-500/10" aria-hidden="true" />}
        {route && route.stops.length === 0 && <div className="rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)]" data-testid="route-empty"><EmptyState icon="🗺️" title="No jobs scheduled this day." /></div>}
        {route && route.stops.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {route.directionsUrl && <a href={route.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 sm:flex-none" data-testid="route-open">Open route in Maps ({route.routed.length} stop{route.routed.length === 1 ? "" : "s"})</a>}
              {route.embedUrl && <button type="button" className={`${button} gap-1.5 ${showMap ? "border-teal-400 bg-teal-500/15 text-teal-700 dark:text-teal-300" : ""}`} data-testid="route-map-toggle" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>{showMap ? "Hide map" : "Show map"}</button>}
            </div>
            {showMap && route.embedUrl && <iframe title="Route map" src={route.embedUrl} data-testid="route-map" className="aspect-[4/3] w-full rounded-2xl border border-teal-500/20 shadow-sm sm:aspect-auto sm:h-96" loading="lazy" referrerPolicy="no-referrer" />}
            <ol className="space-y-2" data-testid="route-stops">
              {route.stops.map((stop) => {
                const n = route.routed.indexOf(stop);
                return (
                  <li key={stop.id} data-testid="route-stop" data-id={stop.id} data-order={n >= 0 ? n + 1 : ""} data-status={stop.status} className={`flex items-start gap-3 rounded-2xl border border-l-4 border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-4 ${stop.status === "done" ? "border-l-emerald-500" : stop.status === "in_progress" ? "border-l-sky-400" : "border-l-teal-500"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums ${n >= 0 ? "bg-teal-500 text-slate-950!" : "bg-slate-500/15"}`}>{n >= 0 ? n + 1 : "–"}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">{stop.startTime ? timeLabel(stop.startTime) : "Any time"} · {stop.client || "No client"}</p>
                      <p className="mt-0.5 break-words text-slate-600">{stop.address || <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200" data-testid="route-no-address"><span aria-hidden="true">⚠</span>No address on this job</span>}</p>
                      <p className="mt-1 text-xs text-slate-500">{STATUS_LABEL[stop.status]}{stop.workerIds.length ? ` · ${stop.workerIds.map((id) => names.get(id) || "Crew").join(", ")}` : ""}</p>
                    </div>
                    <Link href={`/invoice?id=${encodeURIComponent(stop.id)}`} className="inline-flex min-h-11 max-w-[8rem] shrink-0 items-center justify-center truncate rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 transition hover:border-teal-400 dark:text-teal-300" data-testid="route-stop-open">{stop.title}</Link>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </AppShell>
  );
}
