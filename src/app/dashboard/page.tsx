"use client";

import { profitAlertJobs, readMinMargin } from "@/lib/profit-alerts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { recurringDraftsReady, runDueRecurring } from "@/lib/recurring";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { amountOf, documentTotals } from "@/lib/discount";
import { documentStage, STAGE_LABEL } from "@/lib/doc-stage";
import { billedOutstanding, cashCollected } from "@/lib/money";
import { isOpenBalance, invoicePastDue, owedAfterRefunds, paidTotal, readPayments } from "@/lib/payments";
import { uniqueDocs } from "@/lib/change-orders";
import FollowUps from "@/components/FollowUps";
import TodayJobsBlock from "@/components/TodayJobsBlock";
import { todayYmd } from "@/lib/stages";
import { runAutomations, type AutoPlan } from "@/lib/automations";
import { jobWhen } from "@/lib/job-when";
import NeedsReview from "@/components/NeedsReview";
import GettingStarted from "@/components/GettingStarted";

type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
};

type LineItem = {
  description?: string;
  qty?: string;
  rate?: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    dueDate?: string;
    invoiceDate?: string;
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

/** Names of the people scheduled on a job (saved employees), from data.schedule.workerIds. */
function crewNames(doc: SavedDocument) {
  const ids = jobWhen(doc.data as Record<string, unknown> | undefined)?.workerIds;
  if (!Array.isArray(ids) || !ids.length) return [];
  let people: { id: string; name?: string }[] = [];
  try { people = JSON.parse(window.localStorage.getItem("clientready-employees") || "[]"); } catch { people = []; }
  const names = new Map(people.map((person) => [person.id, person.name || ""]));
  return ids.map((id) => names.get(String(id)) || "").filter(Boolean);
}

function balance(doc: SavedDocument) {
  // R126: refund-aware and 0 for void (same rule as billedOutstanding).
  return owedAfterRefunds(invoiceTotal(doc), readPayments(doc.data), doc.data?.status, (doc.data as Record<string, unknown> | undefined)?.rebillRefund);
}

function monthKey(value: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-lg text-teal-600 ring-1 dark:text-teal-300 ring-teal-400/30">
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [search, setSearch] = useState("");
  // false until the account/cache has been read: show placeholders, not $0 / 0 clients.
  // Needs Review items still open (null until NeedsReview has loaded and reported).
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cacheShown, setCacheShown] = useState(false);
  const [stale, setStale] = useState(false);
  // Clock-dependent text (greeting, chart months) renders after mount only: the server runs in UTC, the
  // owner's browser in their own zone, so rendering them on the server caused React #418 in the evening.
  const [now, setNow] = useState<Date | null>(null);
  const [auto, setAuto] = useState<{ sent: AutoPlan[]; errors: string[] }>({ sent: [], errors: [] });
  useEffect(() => setNow(new Date()), []);
  const recurringReady = recurringDraftsReady(documents);

  useEffect(() => {
    async function load() {
      // Speed audit #1: show this device's cached documents at once (Today block, lists); the money cards
      // still wait for the server (R100: the cache can be stale from another device).
      try {
        const cached = window.localStorage.getItem("clientready-documents");
        if (cached) setDocuments(uniqueDocs(JSON.parse(cached)));
        const cachedProfile = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}");
        setOwnerName(cachedProfile.ownerName || cachedProfile.businessName || "");
        setCacheShown(true);
      } catch { /* bad cache: wait for the server */ }
      const fresh = await loadAccountIntoCache();
      if (!fresh) setStale(true);
      const profileRaw = window.localStorage.getItem("clientready-profile");
      const clientsRaw = window.localStorage.getItem("clientready-clients");
      const docsRaw = window.localStorage.getItem("clientready-documents");
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        setOwnerName(profile.ownerName || profile.businessName || "");
      }
      setClients(clientsRaw ? JSON.parse(clientsRaw) : []);
      setDocuments(uniqueDocs(docsRaw ? JSON.parse(docsRaw) : []));
      setLoaded(true);
      // R110: show the dashboard first; recurring drafts and automations run after, then the list refreshes.
      // No server cron: due recurring drafts are made when the app opens.
      const made = await runDueRecurring().catch(() => null);
      // Backlog 13: owner-enabled automations only (all off by default).
      const ran = await runAutomations().catch(() => ({ sent: [], errors: [] }));
      setAuto(ran);
      // Speed audit #5: re-read documents only when recurring or automations changed something.
      if (made || ran.sent.length) setDocuments(uniqueDocs(JSON.parse(window.localStorage.getItem("clientready-documents") || "[]")));
    }
    load();
  }, []);

  const invoices = documents.filter((doc) => doc.type === "invoice");
  const hour = now ? now.getHours() : -1;
  const hello = hour < 0 ? "Hello" :
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // R104: clients = saved clients plus names typed only on invoices/proposals (case-insensitive, once each).
  const clientCount = useMemo(() => {
    const names = new Set(clients.map((client) => String((client as { name?: string }).name || "").trim().toLowerCase()).filter(Boolean));
    for (const doc of documents) { const name = String(doc.clientName || (doc.data as Record<string, unknown> | undefined)?.clientName || "").trim().toLowerCase(); if (name && name !== "no client") names.add(name); }
    return names.size;
  }, [clients, documents]);

  const stats = useMemo(() => {
    // R128: "paid" means nothing is owed (card, cash or marked paid), not only the status field.
    const paidDocs = invoices.filter((doc) => doc.data?.status === "paid" || (invoiceTotal(doc) > 0 && balance(doc) <= 0.004));
    const paid = cashCollected(documents);
    const overdueDocs = invoices.filter((doc) => invoicePastDue(doc.data as Record<string, unknown>, invoiceTotal(doc), balance(doc)));
    const overdue = overdueDocs.reduce((sum, doc) => sum + balance(doc), 0);
    const outstanding = billedOutstanding(documents as never).outstanding; // R126: shared, deduped, no void
    const paidRate = invoices.length
      ? Math.round((paidDocs.length / invoices.length) * 100)
      : 0;
    return {
      outstanding,
      paid,
      overdue,
      overdueCount: overdueDocs.length,
      invoiceCount: invoices.length,
      paidRate,
    };
  }, [invoices]);

  const chart = useMemo(() => {
    const points: { key: string; label: string; total: number }[] = [];
    for (let i = 5; now && i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const total = invoices
        .filter((doc) => {
          const raw = doc.data?.invoiceDate || doc.data?.dueDate || doc.createdAt;
          return monthKey(String(raw || "")) === key;
        })
        .reduce((sum, doc) => sum + invoiceTotal(doc), 0);
      points.push({
        key,
        label: date.toLocaleString("en-US", { month: "short" }),
        total,
      });
    }
    const max = Math.max(...points.map((item) => item.total), 1);
    return { points, max };
  }, [invoices, now]);

  const width = 1000;
  const height = 180;
  const path = chart.points
    .map((point, index) => {
      const x = 20 + (index * (width - 40)) / 5;
      const y = height - 20 - (point.total / chart.max) * (height - 40);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    window.location.href = query
      ? `/documents?q=${encodeURIComponent(query)}`
      : "/documents";
  }

  function newProposal() {
    window.localStorage.setItem("clientready-new-type", "proposal");
    window.location.href = "/invoice";
  }

  const thirdAction =
    stats.overdueCount > 0
      ? {
          href: "/collect",
          icon: "!",
          title: "Chase overdue",
          text: `Follow up on ${stats.overdueCount} overdue invoice${stats.overdueCount === 1 ? "" : "s"}.`,
        }
      : {
          href: "/clients",
          icon: "+",
          title: "Add client",
          text: "Save a client so invoices fill in faster.",
        };

  return (
    <AppShell title="Dashboard">
      <PageHeader
        title={`${hello}${ownerName ? `, ${ownerName}` : ""}.`}
        subtitle={<>{stale && loaded ? <span data-testid="dashboard-stale">Couldn&apos;t reach the server. These are the numbers saved on this device. </span> : null}{!loaded ? "Loading your numbers…" : stats.invoiceCount === 0
          ? "Create your first invoice to see totals."
          : "Here is what is happening with your invoices today."}</>}
        actions={<>
          <a href="/invoice" className="rounded-xl bg-teal-500 px-5 py-2.5 text-center text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">New invoice +</a>
          <button type="button" onClick={newProposal} className="rounded-xl border border-teal-500/40 px-5 py-2.5 text-sm font-medium transition hover:border-teal-400">New proposal</button>
        </>}
      />

      <div className="mb-6">
        <form onSubmit={handleSearch} >
          <input
            className="w-full rounded-xl border border-teal-500/20 bg-[var(--cr-card)] px-4 py-2.5 text-sm placeholder:text-[var(--cr-muted)] focus:border-teal-400/60 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
            placeholder="Search invoices, clients, items…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="dashboard-search"
          />
        </form>
        {search.trim().length >= 2 && (() => {
          // R107: results right here (fuzzy: every word must appear somewhere), Enter opens all matches.
          const words = search.trim().toLowerCase().split(/\s+/);
          const hay = (doc: (typeof documents)[number]) => [doc.title, doc.clientName, (doc.data as Record<string, unknown> | undefined)?.invoiceNumber, (doc.data as Record<string, unknown> | undefined)?.clientName, ...(((doc.data as { items?: { description?: string }[] } | undefined)?.items) || []).map((item) => item.description)].join(" ").toLowerCase();
          const hits = documents.filter((doc) => words.every((word) => hay(doc).includes(word))).slice(0, 6);
          return (
            <ul className="mt-2 divide-y divide-teal-500/10 rounded-xl border border-teal-500/20 bg-[var(--cr-card)] text-sm" data-testid="dashboard-search-results">
              {hits.length === 0 && <li className="px-4 py-3 text-[var(--cr-muted)]">No matches. Press Enter to search everything.</li>}
              {hits.map((doc) => <li key={doc.id}><a className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-teal-500/5" href={`/invoice?id=${encodeURIComponent(doc.id)}`} data-testid="dashboard-search-hit"><span className="truncate">{String((doc.data as Record<string, unknown> | undefined)?.invoiceNumber || doc.title)} · {doc.clientName || "No client"}</span><span className="text-xs text-[var(--cr-muted)]">{doc.type}</span></a></li>)}
            </ul>
          );
        })()}
      </div>

      {/* User: denser desktop. >=1024px two columns: Today | Recent, Needs attention | money (stats, chart under),
          quick actions across. Mobile keeps one column in priority order: Today, attention, stats, chart, recent, actions. */}
      {/* User: stats (2x2, left) and the Invoice overview chart (right, same height) in one row at the very top; mobile: stats then chart, still first. */}
      <div className="cr-dash-money mt-6 grid min-w-0 gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-5" data-testid="dash-cell-money">
      <div className="cr-stat-row" data-testid="dashboard-stats" data-layout="stat-row">
        <a href="/documents?filter=outstanding" data-testid="stat-outstanding" data-loading={loaded ? undefined : "true"} className="group block data-[loading=true]:pointer-events-none data-[loading=true]:animate-pulse rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-3 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Total outstanding</p>
            <IconWrap>$</IconWrap>
          </div>
          <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight group-data-[loading=true]:w-24 group-data-[loading=true]:rounded-md group-data-[loading=true]:bg-teal-500/15 group-data-[loading=true]:text-transparent sm:text-2xl">{loaded ? `$${stats.outstanding.toFixed(2)}` : "—"}</p>
          <p className="mt-1 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.outstanding === 0 ? "No outstanding invoices" : "Not marked paid"}
          </p>
        </a>
        <a href="/documents?filter=paid" data-testid="stat-paid" data-loading={loaded ? undefined : "true"} className="group block data-[loading=true]:pointer-events-none data-[loading=true]:animate-pulse rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-3 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Paid</p>
            <IconWrap>✓</IconWrap>
          </div>
          <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight group-data-[loading=true]:w-24 group-data-[loading=true]:rounded-md group-data-[loading=true]:bg-teal-500/15 group-data-[loading=true]:text-transparent sm:text-2xl">{loaded ? `$${stats.paid.toFixed(2)}` : "—"}</p>
          <p className="mt-1 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.paid === 0 ? "No payments yet" : `${stats.paidRate}% marked paid`}
          </p>
        </a>
        <a href="/documents?filter=overdue" data-testid="stat-overdue" data-loading={loaded ? undefined : "true"} className={`group block data-[loading=true]:pointer-events-none data-[loading=true]:animate-pulse rounded-2xl border ${stats.overdue > 0 ? "cr-stat-bad border-rose-400/50 bg-rose-50/60 dark:bg-rose-950/30" : "border-teal-500/15 bg-[var(--cr-card)]"} p-3 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400`}>
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Overdue</p>
            <IconWrap>!</IconWrap>
          </div>
          <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight group-data-[loading=true]:w-24 group-data-[loading=true]:rounded-md group-data-[loading=true]:bg-teal-500/15 group-data-[loading=true]:text-transparent sm:text-2xl">{loaded ? `$${stats.overdue.toFixed(2)}` : "—"}</p>
          <p className="mt-1 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.overdueCount === 0 ? "No overdue invoices" : `${stats.overdueCount} overdue`}
          </p>
        </a>
        <Link href="/clients" data-testid="stat-clients" data-loading={loaded ? undefined : "true"} className="group block data-[loading=true]:pointer-events-none data-[loading=true]:animate-pulse rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-3 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Clients</p>
            <IconWrap>☺</IconWrap>
          </div>
          <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight group-data-[loading=true]:w-24 group-data-[loading=true]:rounded-md group-data-[loading=true]:bg-teal-500/15 group-data-[loading=true]:text-transparent sm:text-2xl">{loaded ? clientCount : "—"}</p>
          <p className="mt-1 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : clientCount === 0 ? "No clients added" : clientCount > clients.length ? "Saved + on invoices" : "Saved clients"}
          </p>
        </Link>
      </div>
      {stats.invoiceCount > 0 && (
        <div data-testid="dash-chart" className="flex min-w-0 flex-col rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 sm:mb-4">
            <h2 className="text-base font-semibold">Invoice overview</h2>
            <span className="text-xs text-[var(--cr-muted)]">Last 6 months · {stats.paidRate}% of invoices marked paid</span>
          </div>
          <svg viewBox={`0 0 ${width} ${height + 28}`} className="h-auto w-full overflow-visible sm:h-56 lg:h-auto lg:min-h-0 lg:flex-1">
            {[1, 2, 3, 4].map((line) => (
              <line
                key={line}
                x1="20"
                x2={width - 20}
                y1={20 + line * 35}
                y2={20 + line * 35}
                stroke="currentColor"
                opacity="0.3"
              />
            ))}
            <path d={path} fill="none" stroke="#2dd4bf" strokeWidth="3" />
            {chart.points.map((point, index) => {
              const x = 20 + (index * (width - 40)) / 5;
              const y = height - 20 - (point.total / chart.max) * (height - 40);
              return <circle key={point.key} cx={x} cy={y} r="5" fill="#2dd4bf" />;
            })}
            {chart.points.map((point, index) => {
              const x = 20 + (index * (width - 40)) / 5;
              return (
                <text
                  key={`${point.key}-label`}
                  x={x}
                  y={height + 22}
                  textAnchor={index === 0 ? "start" : index === chart.points.length - 1 ? "end" : "middle"}
                  fill="currentColor"
                  opacity="0.8"
                  className="text-[34px] sm:text-[16px]"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>
        </div>
      )}
      </div>
      <div data-testid="dash-grid" className="mt-4 grid items-start gap-4 lg:grid-cols-2 lg:gap-5 lg:mt-5">
          <div className="min-w-0 lg:order-1" data-testid="dash-cell-today"><TodayJobsBlock docs={documents as never} loaded={loaded || cacheShown} /></div>
          <section className="min-w-0 space-y-3 lg:order-3" data-testid="dash-cell-attention" aria-label="Needs attention">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cr-muted)]">Needs attention</h2>
          {(auto.sent.length > 0 || auto.errors.length > 0) && (
            <div className={`space-y-2 rounded-xl border px-4 py-3 text-sm ${auto.errors.length ? "border-rose-300/70" : "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800"}`} data-testid="auto-sent" data-count={auto.sent.length}>
              {auto.sent.length > 0 && <p className="flex items-start gap-2 font-medium text-emerald-800 dark:text-emerald-200"><span aria-hidden="true">✓</span><span className="min-w-0 break-words">Sent automatically: {auto.sent.map((item) => `${item.kind === "done" ? "invoice" : "reminder"} to ${item.to}`).join("; ")}</span></p>}
              {auto.errors.map((error) => <p key={error} className="cr-tone-bad rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800" data-testid="auto-error">{error}</p>)}
              <a href="/profile" className="inline-flex min-h-11 items-center text-xs font-medium underline">Automation settings</a>
            </div>
          )}
          {loaded && <FollowUps docs={documents as never} today={todayYmd()} limit={5} testid="dashboard-reminders" />}
      {recurringReady > 0 && (
        <a href="/documents?q=draft" data-testid="recurring-ready" className="flex items-center justify-between rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-700 dark:text-teal-200 transition hover:bg-teal-500/15">
          {recurringReady} recurring draft{recurringReady === 1 ? "" : "s"} ready for review
        </a>
      )}
      <ProfitAlertsCard loaded={loaded} documents={documents} />
      <GettingStarted loading={!loaded} documents={documents} />
      <NeedsReview loading={!loaded} onCount={setReviewCount} documents={documents} onDocuments={(docs) => setDocuments(uniqueDocs(docs as SavedDocument[]))} />
          {loaded && reviewCount === 0 && recurringReady === 0 && stats.overdueCount === 0 && (
            <div data-testid="all-caught-up" className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">✓</span>
              <span><span className="font-semibold">All caught up.</span> <span className="text-[var(--cr-muted)]">Nothing overdue or waiting on you.</span></span>
            </div>
          )}
          </section>
          <div className="min-w-0 rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] shadow-sm lg:order-2" data-testid="recent-docs">
            <div className="flex items-center gap-3 border-b border-teal-500/15 px-4 py-2 min-[900px]:justify-between">
              <h2 className="text-base font-semibold">Recent documents</h2>
              <a href="/documents" className="inline-flex min-h-11 items-center text-sm font-medium text-teal-600 hover:underline dark:text-teal-300">View all</a>
            </div>
            {documents.length === 0 && !loaded && (
              <div className="space-y-3 px-5 py-4" aria-busy="true" aria-label="Loading">
                {[0, 1, 2].map((n) => <div key={n} className="flex items-center justify-between gap-3"><div className="h-4 w-2/5 animate-pulse rounded bg-teal-500/10" /><div className="h-4 w-16 animate-pulse rounded bg-teal-500/10" /></div>)}
              </div>
            )}
            {documents.length === 0 && loaded && <EmptyState icon="📄" title="No documents yet." line="Your recent invoices and proposals will show here." actionHref="/invoice" actionLabel="New invoice" />}
            {documents.slice(0, 5).map((doc) => (
              <a key={doc.id} href={`/documents?q=${encodeURIComponent(doc.title || "")}`} className="flex items-start justify-between gap-3 border-b border-teal-500/10 px-4 py-2 text-sm leading-snug transition last:border-b-0 hover:bg-teal-500/5">
                <span className="min-w-0" data-testid="recent-doc" data-doc-id={doc.id}>
                  <span className="block truncate font-medium">{doc.title || "Untitled"}{doc.clientName && doc.clientName !== "No client" ? <span data-testid="recent-client"> · {doc.clientName}</span> : null}</span>
                  {(() => {
                    const first = (doc.data?.items || []).find((item) => String(item.description || "").trim()) || (doc.data?.items || [])[0];
                    const crew = crewNames(doc);
                    return (<>
                      {first && <span className="block truncate text-xs tabular-nums text-slate-700 dark:text-slate-200" data-testid="recent-line">{String(first.description || "Item")}{first.rate ? ` · $${amountOf(first.rate).toFixed(2)}${amountOf(first.qty) !== 1 ? ` × ${first.qty}` : ""}` : ""}</span>}
                      <span className={`block truncate text-xs ${crew.length ? "text-teal-700 dark:text-teal-300" : "italic text-[var(--cr-muted)]"}`} data-testid="recent-crew" data-crew-count={crew.length}>{crew.length ? `Crew: ${crew.join(", ")}` : "No employees scheduled"}</span>
                    </>);
                  })()}
                  {doc.type === "invoice" && (() => {
                    const total = invoiceTotal(doc); const owed = balance(doc); const paid = total - owed;
                    return paid > 0.004 && owed > 0.004 ? <span className="block text-xs font-medium tabular-nums text-amber-700 dark:text-amber-300" data-testid="recent-remaining">${paid.toFixed(2)} paid · Remaining balance ${owed.toFixed(2)}</span> : null;
                  })()}
                  <span className="block text-xs capitalize text-[var(--cr-muted)]">{doc.type} · {doc.createdAt}</span>
                </span>
                <span className="shrink-0 rounded-full border border-teal-500/30 px-2.5 py-0.5 text-xs font-semibold capitalize" data-testid="recent-status">{STAGE_LABEL[documentStage(doc as never, documents as never).stage]}</span>
              </a>
            ))}
          </div>

        <aside className="min-w-0 space-y-3 lg:order-5 lg:col-span-2" data-testid="dash-cell-actions">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cr-muted)]">Quick actions</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <a href="/invoice" className="group rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] flex items-center gap-3 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400/50 hover:shadow-md">
          <IconWrap>+</IconWrap>
          <span className="min-w-0"><p className="font-semibold">New invoice</p>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">Create an invoice and send it to a client.</p></span>
        </a>
        <button type="button" onClick={newProposal} className="group rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] flex items-center gap-3 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400/50 hover:shadow-md text-left">
          <IconWrap>✎</IconWrap>
          <span className="min-w-0"><p className="font-semibold">New proposal</p>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">Create a proposal and share it with a prospect.</p></span>
        </button>
        <a href={thirdAction.href} className="group rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] flex items-center gap-3 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400/50 hover:shadow-md">
          <IconWrap>{thirdAction.icon}</IconWrap>
          <span className="min-w-0"><p className="font-semibold">{thirdAction.title}</p>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">{thirdAction.text}</p></span>
        </a>
      </div>
        </aside>
      </div>
    </AppShell>
  );
}
/** Owner: recent jobs that lost money, fell under the minimum margin, or where the crew spent over the estimate. */
function ProfitAlertsCard({ loaded, documents }: { loaded: boolean; documents: SavedDocument[] }) {
  const [minMargin, setMinMargin] = useState(20);
  useEffect(() => {
    Promise.resolve().then(() => { try { setMinMargin(readMinMargin(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}"))); } catch { /* default */ } });
  }, []);
  const rows = useMemo(() => (loaded ? profitAlertJobs(documents as never, minMargin) : []), [loaded, documents, minMargin]);
  if (!rows.length) return null;
  return (
    <div data-testid="profit-alerts" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-semibold">Profit alerts <span className="font-normal text-[var(--cr-muted)]">· last 90 days</span></p>
      <ul className="mt-2 space-y-1.5">
        {rows.slice(0, 5).map((row) => (
          <li key={row.id}>
            <a href={`/invoice?id=${encodeURIComponent(row.id)}`} data-testid="profit-alert-row" data-kind={row.alerts[0].kind} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 hover:bg-amber-500/10">
              <span className="min-w-0"><span className="block font-medium">{row.number}{row.client ? ` · ${row.client}` : ""}</span><span className="block text-xs text-[var(--cr-muted)]">{row.alerts.map((alert) => alert.kind === "loss" ? "Loss" : alert.kind === "low-margin" ? "Low margin" : "Crew over estimate").join(" · ")}</span></span>
              <span className={`shrink-0 tabular-nums font-semibold ${row.left < 0 ? "text-rose-700" : ""}`}>{row.left < 0 ? "−" : ""}${Math.abs(row.left).toFixed(2)}</span>
            </a>
          </li>
        ))}
      </ul>
      {rows.length > 5 && <p className="mt-1 text-xs text-[var(--cr-muted)]">+{rows.length - 5} more</p>}
    </div>
  );
}
