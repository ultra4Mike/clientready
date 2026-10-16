"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} data-testid="route-prev" onClick={() => { setDate(addDaysYmd(date, -1)); setShowMap(false); }} aria-label="Previous day">←</button>
          <input type="date" className={`${button} bg-transparent`} data-testid="route-date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setShowMap(false); } }} />
          <button type="button" className={button} data-testid="route-next" onClick={() => { setDate(addDaysYmd(date, 1)); setShowMap(false); }} aria-label="Next day">→</button>
          {workers.length > 0 && (
            <select className={`${button} bg-transparent`} data-testid="route-worker" value={worker} onChange={(event) => setWorker(event.target.value)}>
              <option value="all">Everyone</option>
              {workers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          )}
        </div>
        {date && <h2 className="text-lg font-semibold">{niceYmd(date)}</h2>}
        {!loaded && <div className="h-28 animate-pulse rounded-2xl bg-teal-500/10" aria-hidden="true" />}
        {route && route.stops.length === 0 && <p className="rounded-2xl border border-dashed border-teal-500/30 p-4 text-sm" data-testid="route-empty">No jobs scheduled this day.</p>}
        {route && route.stops.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {route.directionsUrl && <a href={route.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-teal-500 px-4 text-sm font-semibold text-slate-950" data-testid="route-open">Open route in Maps ({route.routed.length} stop{route.routed.length === 1 ? "" : "s"})</a>}
              {route.embedUrl && <button type="button" className={button} data-testid="route-map-toggle" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>{showMap ? "Hide map" : "Show map"}</button>}
            </div>
            {showMap && route.embedUrl && <iframe title="Route map" src={route.embedUrl} data-testid="route-map" className="h-80 w-full rounded-2xl border border-teal-500/20" loading="lazy" referrerPolicy="no-referrer" />}
            <ol className="space-y-2" data-testid="route-stops">
              {route.stops.map((stop) => {
                const n = route.routed.indexOf(stop);
                return (
                  <li key={stop.id} data-testid="route-stop" data-id={stop.id} data-order={n >= 0 ? n + 1 : ""} data-status={stop.status} className="flex items-start gap-3 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-sm font-bold">{n >= 0 ? n + 1 : "–"}</span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">{stop.startTime ? timeLabel(stop.startTime) : "Any time"} · {stop.client || "No client"}</p>
                      <p className="text-slate-500">{stop.address || <span data-testid="route-no-address">No address on this job</span>}</p>
                      <p className="text-xs text-slate-500">{STATUS_LABEL[stop.status]}{stop.workerIds.length ? ` · ${stop.workerIds.map((id) => names.get(id) || "Crew").join(", ")}` : ""}</p>
                    </div>
                    <Link href={`/invoice?id=${encodeURIComponent(stop.id)}`} className="text-sm text-teal-600" data-testid="route-stop-open">{stop.title}</Link>
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
