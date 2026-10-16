"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import PortalShare from "@/components/PortalShare";
import Timeline from "@/components/Timeline";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { uniqueDocs } from "@/lib/change-orders";
import { clientTimeline, type TimelineClient } from "@/lib/client-timeline";
import { niceYmd } from "@/lib/scheduled-jobs";

type Client = TimelineClient & { company?: string; email?: string; phone?: string; address?: string };
type Doc = { id: string; type: string; title: string; clientName: string; createdAt: string; data: Record<string, unknown> };

/** Owner: one client's record with a single timeline and billed / paid / owed totals. Read-only. */
export default function ClientRecordPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id || ""));
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const read = () => {
      const rawClients = window.localStorage.getItem("clientready-clients");
      setClients(rawClients ? (JSON.parse(rawClients) as Client[]) : []);
      const rawDocs = window.localStorage.getItem("clientready-documents");
      setDocs(rawDocs ? uniqueDocs(JSON.parse(rawDocs) as Doc[]) : []);
    };
    read();
    (async () => {
      await loadAccountIntoCache().catch(() => false);
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: rows } = await supabase.from("clients").select("*").eq("user_id", data.user.id);
        if (Array.isArray(rows) && rows.length) {
          const next = rows.map((row) => ({ id: row.id, name: row.name || "", company: row.company || "", email: row.email || "", phone: row.phone || "", address: row.address || "", notes: row.notes || "" }));
          window.localStorage.setItem("clientready-clients", JSON.stringify(next));
        }
      }
      read();
      setLoaded(true);
    })();
  }, []);

  const client = clients.find((item) => item.id === id) || null;
  const view = useMemo(() => (client ? clientTimeline(client, docs, clients) : null), [client, docs, clients]);
  const state = view ? "ready" : loaded ? "missing" : "loading";

  return (
    <AppShell title="Client">
      <section className="py-2 sm:py-4" data-testid="client-record" data-state={state} data-client-id={id}>
        {state === "loading" && (
          <div className="space-y-4" aria-hidden="true">
            <div className="h-36 animate-pulse rounded-2xl bg-teal-500/10" />
            <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse rounded-2xl bg-teal-500/10" />)}</div>
            <div className="h-64 animate-pulse rounded-2xl bg-teal-500/10" />
            <p className="sr-only">Loading…</p>
          </div>
        )}
        {state === "missing" && (
          <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-teal-500/30 bg-[var(--cr-card)] px-6 py-14 text-center">
            <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/15 text-2xl">👤</span>
            <p className="mt-4 text-lg font-semibold">This client was not found.</p>
            <p className="mt-1 text-sm text-[var(--cr-muted)]">It may have been removed, or the link is out of date.</p>
            <Link className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-5 text-sm font-semibold text-slate-950! transition hover:bg-teal-400" href="/clients">Back to clients</Link>
          </div>
        )}
        {client && view && (
          <>
            <div className="mb-5 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-6">
              <Link href="/clients" className="mb-3 inline-flex text-xs font-medium text-[var(--cr-muted)] transition hover:text-teal-500">← All clients</Link>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-xl font-bold text-teal-700 dark:text-teal-300">{(client.name || "?").trim().charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 [&>[data-page-header]]:mb-1 [&>[data-page-header]]:border-0 [&>[data-page-header]]:pb-0 [&_h2]:break-words">
                    <PageHeader title={client.name} subtitle={[client.company, client.email, client.phone].filter(Boolean).join(" · ")} />
                    {client.address && <p className="text-sm text-[var(--cr-muted)]" data-testid="client-address">{client.address}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
                  {client.phone && <a href={`tel:${client.phone}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium transition hover:border-teal-400 sm:min-h-10">Call</a>}
                  {client.email && <a href={`mailto:${client.email}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium transition hover:border-teal-400 sm:min-h-10">Email</a>}
                  <a href={`/invoice?clientId=${encodeURIComponent(client.id)}`} data-testid="client-new-invoice" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-500 px-4 text-sm font-semibold text-slate-950! transition hover:bg-teal-400 sm:min-h-10">New invoice</a>
                  <a href={`/invoice?clientId=${encodeURIComponent(client.id)}&type=proposal`} data-testid="client-new-proposal" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/30 px-4 text-sm font-medium transition hover:border-teal-400 sm:min-h-10">New proposal</a>
                </div>
              </div>
            </div>
            <dl className="mb-5 grid grid-cols-3 gap-2 text-sm sm:gap-4" data-testid="client-totals">
              <div className="min-w-0 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-5" data-testid="client-billed" data-value={view.totals.billed.toFixed(2)}><dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cr-muted)] sm:text-xs">Billed</dt><dd className="mt-1 truncate text-base font-bold tabular-nums sm:text-2xl">${view.totals.billed.toFixed(2)}</dd></div>
              <div className="min-w-0 rounded-2xl border border-emerald-500/25 bg-[var(--cr-card)] p-3 shadow-sm sm:p-5" data-testid="client-paid" data-value={view.totals.paid.toFixed(2)}><dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cr-muted)] sm:text-xs">Paid</dt><dd className="mt-1 truncate text-base font-bold tabular-nums text-emerald-700 sm:text-2xl dark:text-emerald-300">${view.totals.paid.toFixed(2)}</dd></div>
              <div className={`min-w-0 rounded-2xl border bg-[var(--cr-card)] p-3 shadow-sm sm:p-5 ${view.totals.owed > 0 ? "border-amber-500/30" : "border-teal-500/20"}`} data-testid="client-owed" data-value={view.totals.owed.toFixed(2)}><dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cr-muted)] sm:text-xs">Owed</dt><dd className={`mt-1 truncate text-base font-bold tabular-nums sm:text-2xl ${view.totals.owed > 0 ? "text-amber-600 dark:text-amber-300" : ""}`}>${view.totals.owed.toFixed(2)}</dd></div>
            </dl>
            <div className="mb-5"><PortalShare clientName={client.name} clientId={client.id} compact /></div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--cr-muted)]">Activity</h2>
            <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-3 shadow-sm sm:p-5" data-testid="client-timeline" data-count={view.items.length}>
              <Timeline
                emptyText="No activity yet."
                items={view.items.map((item) => ({
                  date: item.date ? niceYmd(item.date) : "Notes",
                  type: item.type,
                  title: item.title,
                  amount: item.amount,
                  status: item.status,
                  href: item.href,
                  attrs: { "data-testid": "timeline-item", "data-type": item.type, "data-date": item.date, "data-status": item.status || "" },
                }))}
              />
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
