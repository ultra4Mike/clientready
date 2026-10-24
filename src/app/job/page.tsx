"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import OverlapBadge from "@/components/OverlapBadge";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { docAmounts } from "@/lib/doc-stage";
import { displayStatus } from "@/lib/doc-status";
import { docHref, jobChain, type JobChain } from "@/lib/job-chain";
import { crewIds, readWorkers, statusLabel } from "@/lib/schedule";
import { niceYmd, timeLabel } from "@/lib/scheduled-jobs";
import DocTrail from "@/components/DocTrail";
import { cachedMinMargin, profitAlertsForDoc } from "@/lib/profit-alerts";

type Doc = { id: string; type: string; title: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };
type Tab = "request" | "quote" | "job" | "invoice";
const TABS: [Tab, string][] = [["request", "Request"], ["quote", "Quote"], ["job", "Job"], ["invoice", "Invoice"]];
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Redesign 4: one page per job. Tabs link the related documents; the schedule comes from the one schedule doc. */
export default function JobPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [chain, setChain] = useState<JobChain<Doc> | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("job");
  const [minMargin, setMinMargin] = useState(20);
  const [workers, setWorkers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "";
    const wanted = params.get("tab") as Tab | null;
    loadAccountIntoCache().catch(() => false).then(() => {
      const raw = window.localStorage.getItem("clientready-documents");
      const all = raw ? (JSON.parse(raw) as Doc[]) : [];
      const found = jobChain(all, id);
      setDocs(all);
      setMinMargin(cachedMinMargin());
      setChain(found);
      setWorkers(new Map(readWorkers().map((w) => [w.id, w.name])));
      if (wanted && TABS.some(([k]) => k === wanted)) setTab(wanted);
    });
  }, []);

  const main = chain ? chain.invoice || chain.quote : null;
  const data = (main?.data || {}) as Record<string, unknown>;
  const client = main?.clientName || text(data.clientName) || "No client";
  const s = chain?.schedule || null;
  const crew = chain?.scheduleDoc ? [...new Set([...(s?.workerIds || []), ...(crewIds(chain.scheduleDoc.data?.crew) as string[])])] : [];

  const docLine = (doc: Doc, testid: string) => {
    const { total, owed } = docAmounts(doc);
    return (
      <div data-testid={testid} data-doc-id={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><span className="font-semibold">{text(doc.data?.invoiceNumber) || doc.title}</span> · {displayStatus(doc as never, docs as never).label} · ${total.toFixed(2)}{doc.type === "invoice" && owed > 0.004 ? ` · $${owed.toFixed(2)} owed` : ""}</span>
        <a href={docHref(doc)} className="cr-btn cr-btn-secondary" data-testid={`${testid}-open`}>Open</a>
      </div>
    );
  };

  return (
    <AppShell title="Job">
      <PageHeader title={chain === undefined ? "Job" : chain ? client : "Job not found"} subtitle={s ? `${niceYmd(s.date)}${s.startTime ? ` · ${timeLabel(s.startTime)}${s.endTime ? `–${timeLabel(s.endTime)}` : ""}` : ""}` : chain ? "Not scheduled yet" : ""} />
      {chain === null && <p data-testid="job-not-found" className="text-sm">This job could not be found. <a href="/documents" className="underline">Open documents</a></p>}
      {chain && (
        <>
          {main && <DocTrail docs={docs} currentId={main.id} />}
          {/* Owner-only profit warning (in-app; no email). Same math as the dashboard card and the editor. */}
          {profitAlertsForDoc(main, minMargin).map((alert) => (
            <p key={alert.kind} role="status" data-testid="job-profit-alert" data-kind={alert.kind} className={`mb-3 rounded-lg border px-3 py-2 text-sm ${alert.kind === "loss" ? "border-rose-400/60 bg-rose-50 text-rose-800" : "border-amber-400/60 bg-amber-50 text-amber-900"}`}>⚠ {alert.text} {main && <a href={`${docHref(main)}#costs`} className="underline">Review costs</a>}</p>
          ))}
          <div role="tablist" data-testid="job-tabs" className="mb-3 flex w-full gap-1 rounded-xl border border-slate-500/30 bg-[var(--cr-card)] p-1 shadow-sm sm:w-auto">
            {TABS.map(([key, label], i) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} data-testid={`job-tab-${key}`} onClick={() => setTab(key)} className={`cr-btn flex-1 sm:flex-none ${tab === key ? "cr-btn-primary" : "cr-btn-text"}`}>
                {i > 0 && <span aria-hidden="true" className="mr-1 opacity-50">›</span>}{label}
              </button>
            ))}
          </div>
          <section className="cr-panel rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-sm" data-testid={`job-panel-${tab}`}>
            {tab === "request" && (
              <div className="space-y-1">
                <p data-testid="job-client"><span className="font-semibold">{client}</span>{text(data.clientCompany) ? ` · ${text(data.clientCompany)}` : ""}</p>
                {text(data.clientPhone) && <p><a href={`tel:${text(data.clientPhone)}`} className="underline">{text(data.clientPhone)}</a></p>}
                {text(data.clientAddress) && <p>{text(data.clientAddress)}</p>}
                <p data-testid="job-request-notes" className="whitespace-pre-wrap text-[var(--cr-muted)]">{text((chain.quote || main)?.data?.notes) || "No request notes."}</p>
              </div>
            )}
            {tab === "quote" && (chain.quote ? docLine(chain.quote, "job-quote") : (
              <p data-testid="job-no-quote">No quote for this job. {chain.invoice ? "It was invoiced directly." : ""}</p>
            ))}
            {tab === "job" && (
              <div className="space-y-2">
                {s ? (
                  <>
                    <p data-testid="job-when">{niceYmd(s.date)} · {s.startTime ? `${timeLabel(s.startTime)}${s.endTime ? `–${timeLabel(s.endTime)}` : ""}` : "Any time"} · <span data-testid="job-status">{statusLabel(s)}</span></p>
                    {chain.scheduleDoc && <OverlapBadge docs={docs} doc={chain.scheduleDoc} onMoved={() => window.location.reload()} />}
                    <p data-testid="job-crew">{crew.length ? crew.map((id) => workers.get(id) || "Unknown worker").join(", ") : "No crew assigned"}</p>
                  </>
                ) : <p data-testid="job-unscheduled">Not scheduled yet.</p>}
                {chain.scheduleDoc && <a href={`${docHref(chain.scheduleDoc)}#schedule`} data-testid="job-edit-schedule" className="cr-btn cr-btn-secondary">{s ? "Change schedule" : "Schedule it"}</a>}
              </div>
            )}
            {tab === "invoice" && (
              <div className="divide-y divide-teal-500/10">
                {chain.invoice ? docLine(chain.invoice, "job-invoice") : <p data-testid="job-no-invoice">Not invoiced yet.{chain.quote ? <> <a href={docHref(chain.quote)} className="underline">Open the quote</a> to make the invoice.</> : null}</p>}
                {chain.changeOrders.map((co) => <div key={co.id}>{docLine(co, "job-change-order")}</div>)}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
