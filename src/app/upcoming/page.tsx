"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { amountOf, documentTotals } from "@/lib/discount";
import { uniqueDocs } from "@/lib/change-orders";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { addDaysYmd, localYmd, niceYmd, scheduledJobs, timeLabel } from "@/lib/scheduled-jobs";
import { doneState, statusLabel } from "@/lib/schedule";

type LineItem = {
  description?: string;
  qty?: string;
  rate?: string;
};

type SavedDocument = {
  id: string;
  [key: string]: unknown;
  type: string;
  title: string;
  clientName: string;
  data?: {
    dueDate?: string;
    status?: string;
    jobTime?: string;
    [key: string]: unknown;
    taxPercent?: string;
    discountType?: string;
    discountValue?: string;
    items?: LineItem[];
  };
};

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + amountOf(item.qty) * amountOf(item.rate);
  }, 0);
  return documentTotals(subtotal, doc.data?.taxPercent, doc.data?.discountType, doc.data?.discountValue).total;
}


export default function UpcomingPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const read = () => {
      const raw = window.localStorage.getItem("clientready-documents");
      setDocuments(raw ? uniqueDocs(JSON.parse(raw)) : []);
    };
    read();
    // Same data as the calendar: refresh from the account, then read again.
    loadAccountIntoCache().catch(() => false).then(() => { read(); setLoaded(true); });
  }, []);

  // Today and the next 6 days, as local dates (same as the calendar).
  const today = localYmd();
  const last = addDaysYmd(today, 6);
  const jobs = useMemo(
    () => scheduledJobs(documents).filter(({ schedule }) => schedule.date >= today && schedule.date <= last),
    [documents, today, last],
  );
  const upcoming = useMemo(() => {
    const scheduled = new Set(jobs.map(({ doc }) => doc.id));
    return documents
      .filter((doc) => doc.type === "invoice" && !scheduled.has(doc.id) && /^\d{4}-\d{2}-\d{2}$/.test(doc.data?.dueDate || ""))
      .filter((doc) => doc.data?.status !== "paid" && (doc.data?.dueDate || "") >= today && (doc.data?.dueDate || "") <= last)
      .sort((a, b) => String(a.data?.dueDate).localeCompare(String(b.data?.dueDate)));
  }, [documents, jobs, today, last]);

  function openView(id: string) {
    window.localStorage.setItem("clientready-open-document", id);
    window.location.href = "/invoice-view";
  }

  return (
    <AppShell title="This week">

      <section className="max-w-4xl py-2 sm:py-4">
        <PageHeader title="This week" subtitle="Scheduled jobs and invoices due in the next 7 days." actions={<a href="/calendar" className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm font-medium transition hover:border-teal-400">Calendar</a>} />

        <div className="mt-8 space-y-3">
          {loaded && jobs.length === 0 && upcoming.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15 text-xl">📅</span><p className="text-base font-semibold">Nothing scheduled this week.</p><p className="max-w-sm text-sm text-[var(--cr-muted)]">Invoices due and jobs in the next 7 days will appear here.</p><a href="/calendar" className="mt-2 rounded-lg border border-teal-500/30 px-4 py-2 text-sm font-medium">Open calendar</a></div>
          )}

          {!loaded && jobs.length === 0 && upcoming.length === 0 && <div className="space-y-3" data-loading="true" aria-busy="true"><span className="sr-only">Loading…</span>{[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl bg-teal-500/10 motion-reduce:animate-none" />)}</div>}

          {jobs.map(({ doc, schedule }) => (
            <a
              key={`job-${doc.id}`}
              href={`/invoice?id=${encodeURIComponent(doc.id)}`}
              data-testid="upcoming-job"
              className="block w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
            >
              <p className="text-base font-semibold">
                {schedule.startTime ? `${timeLabel(schedule.startTime)} · ` : ""}
                {doc.title} · {doc.clientName}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                {niceYmd(schedule.date)} · <span data-done={doneState(schedule) || undefined}>Job {statusLabel(schedule).toLowerCase()}</span>
              </p>
            </a>
          ))}

          {upcoming.length > 0 && <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Invoices due</h2>}
          {upcoming.map((doc) => (
            <button
              key={doc.id}
              type="button"
              data-testid="upcoming-due"
              onClick={() => openView(doc.id)}
              className="block w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-500 hover:shadow-md"
            >
              <p className="text-base font-semibold">
                {doc.data?.jobTime ? `${doc.data.jobTime} · ` : ""}
                {doc.title} · {doc.clientName}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">
                Due {niceYmd(doc.data?.dueDate || "")} · {doc.data?.status || "draft"} · $
                {invoiceTotal(doc).toFixed(2)}
              </p>
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}