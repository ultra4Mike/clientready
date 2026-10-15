"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { recurringDraftsReady, runDueRecurring } from "@/lib/recurring";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { amountOf, documentTotals } from "@/lib/discount";
import { balanceDue, isOpenBalance, paidTotal, readPayments } from "@/lib/payments";
import { uniqueDocs } from "@/lib/change-orders";
import NeedsReview from "@/components/NeedsReview";

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

function balance(doc: SavedDocument) {
  return balanceDue(invoiceTotal(doc), paidTotal(readPayments(doc.data)), doc.data?.status);
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
  const [loaded, setLoaded] = useState(false);
  const recurringReady = recurringDraftsReady(documents);

  useEffect(() => {
    async function load() {
      await loadAccountIntoCache();
      // No server cron: due recurring drafts are made when the app opens.
      await runDueRecurring();
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
    }
    load();
  }, []);

  const invoices = documents.filter((doc) => doc.type === "invoice");
  const hour = new Date().getHours();
  const hello =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stats = useMemo(() => {
    const paidDocs = invoices.filter((doc) => doc.data?.status === "paid");
    const paid = paidDocs.reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const overdueDocs = invoices.filter((doc) => doc.data?.status === "overdue");
    const overdue = overdueDocs.reduce((sum, doc) => sum + balance(doc), 0);
    const outstanding = invoices.filter((doc) => isOpenBalance(doc.data?.status, balance(doc))).reduce((sum, doc) => sum + balance(doc), 0);
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
    const now = new Date();
    const points = [];
    for (let i = 5; i >= 0; i -= 1) {
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
  }, [invoices]);

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
    <AppShell title={`${hello}${ownerName ? `, ${ownerName}` : ""}.`}>
      <PageHeader
        title={`${hello}${ownerName ? `, ${ownerName}` : ""}.`}
        subtitle={<>{!loaded ? "Loading your numbers…" : stats.invoiceCount === 0
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
            placeholder="Search invoices, clients, documents..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <a href="/documents?filter=outstanding" data-testid="stat-outstanding" data-loading={loaded ? undefined : "true"} className="block rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-4 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Total outstanding</p>
            <IconWrap>$</IconWrap>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-3xl">{loaded ? `$${stats.outstanding.toFixed(2)}` : "—"}</p>
          <p className="mt-2 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.outstanding === 0 ? "No outstanding invoices" : "Not marked paid"}
          </p>
        </a>
        <a href="/documents?filter=paid" data-testid="stat-paid" data-loading={loaded ? undefined : "true"} className="block rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-4 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Paid</p>
            <IconWrap>✓</IconWrap>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-3xl">{loaded ? `$${stats.paid.toFixed(2)}` : "—"}</p>
          <p className="mt-2 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.paid === 0 ? "No payments yet" : `${stats.paidRate}% marked paid`}
          </p>
        </a>
        <a href="/documents?filter=overdue" data-testid="stat-overdue" data-loading={loaded ? undefined : "true"} className="block rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-4 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Overdue</p>
            <IconWrap>!</IconWrap>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-3xl">{loaded ? `$${stats.overdue.toFixed(2)}` : "—"}</p>
          <p className="mt-2 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : stats.overdueCount === 0 ? "No overdue invoices" : `${stats.overdueCount} overdue`}
          </p>
        </a>
        <a href="/clients" data-testid="stat-clients" data-loading={loaded ? undefined : "true"} className="block rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-4 shadow-sm transition hover:border-teal-400/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 sm:p-5">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cr-muted)] sm:text-xs">Clients</p>
            <IconWrap>☺</IconWrap>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums tracking-tight sm:text-3xl">{loaded ? clients.length : "—"}</p>
          <p className="mt-2 text-xs text-[var(--cr-muted)]">
            {!loaded ? "Loading…" : clients.length === 0 ? "No clients added" : "Saved clients"}
          </p>
        </a>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
      {stats.invoiceCount > 0 && (
        <div className="rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Invoice overview</h2>
            <span className="text-xs text-[var(--cr-muted)]">Last 6 months · {stats.paidRate}% of invoices marked paid</span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full">
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
                  y={height - 2}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  opacity="0.7"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>
        </div>
      )}

          <div className="rounded-2xl border border-teal-500/15 bg-[var(--cr-card)] shadow-sm" data-testid="recent-docs">
            <div className="flex items-center justify-between border-b border-teal-500/15 px-5 py-4">
              <h2 className="text-base font-semibold">Recent documents</h2>
              <a href="/documents" className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-300">View all</a>
            </div>
            {documents.length === 0 && <p className="px-5 py-8 text-center text-sm text-[var(--cr-muted)]">{loaded ? "No documents yet." : "Loading…"}</p>}
            {documents.slice(0, 5).map((doc) => (
              <a key={doc.id} href={`/documents?q=${encodeURIComponent(doc.title || "")}`} className="flex items-center justify-between gap-3 border-b border-teal-500/10 px-5 py-3 text-sm transition last:border-b-0 hover:bg-teal-500/5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{doc.title || "Untitled"}</span>
                  <span className="block text-xs capitalize text-[var(--cr-muted)]">{doc.type} · {doc.createdAt}</span>
                </span>
                <span className="shrink-0 rounded-full border border-teal-500/30 px-2.5 py-0.5 text-xs font-semibold capitalize">{String(doc.data?.status || "draft")}</span>
              </a>
            ))}
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--cr-muted)]">Needs attention</h2>
      {recurringReady > 0 && (
        <a href="/documents?q=draft" data-testid="recurring-ready" className="flex items-center justify-between rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-700 dark:text-teal-200 transition hover:bg-teal-500/15">
          {recurringReady} recurring draft{recurringReady === 1 ? "" : "s"} ready for review
        </a>
      )}
      <NeedsReview loading={!loaded} documents={documents} onDocuments={(docs) => setDocuments(uniqueDocs(docs as SavedDocument[]))} />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <a href="/collect" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 transition hover:border-amber-400">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Overdue</span>
              <span className="mt-1 block text-lg font-bold tabular-nums">{loaded ? stats.overdueCount : "—"}</span>
            </a>
            <a href="/documents?filter=outstanding" className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3 transition hover:border-teal-400">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Outstanding</span>
              <span className="mt-1 block text-lg font-bold tabular-nums">{loaded ? `$${stats.outstanding.toFixed(0)}` : "—"}</span>
            </a>
          </div>
          <h2 className="pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--cr-muted)]">Quick actions</h2>
      <div className="grid gap-2">
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