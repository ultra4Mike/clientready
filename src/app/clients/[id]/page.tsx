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
        {state === "loading" && <p className="p-6 text-sm text-[var(--cr-muted)]">Loading…</p>}
        {state === "missing" && (
          <p className="p-6 text-sm">This client was not found. <Link className="underline" href="/clients">Back to clients</Link></p>
        )}
        {client && view && (
          <>
            <PageHeader title={client.name} subtitle={[client.company, client.email, client.phone].filter(Boolean).join(" · ")} actions={<Link href="/clients" className="text-sm underline">All clients</Link>} />
            {client.address && <p className="mb-3 text-sm text-[var(--cr-muted)]" data-testid="client-address">{client.address}</p>}
            <dl className="mb-6 grid grid-cols-3 gap-3 text-sm" data-testid="client-totals">
              <div data-testid="client-billed" data-value={view.totals.billed.toFixed(2)}><dt className="text-[var(--cr-muted)]">Billed</dt><dd className="font-semibold">${view.totals.billed.toFixed(2)}</dd></div>
              <div data-testid="client-paid" data-value={view.totals.paid.toFixed(2)}><dt className="text-[var(--cr-muted)]">Paid</dt><dd className="font-semibold">${view.totals.paid.toFixed(2)}</dd></div>
              <div data-testid="client-owed" data-value={view.totals.owed.toFixed(2)}><dt className="text-[var(--cr-muted)]">Owed</dt><dd className="font-semibold">${view.totals.owed.toFixed(2)}</dd></div>
            </dl>
            <div className="mb-6"><PortalShare clientName={client.name} clientId={client.id} compact /></div>
            <div data-testid="client-timeline" data-count={view.items.length}>
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
