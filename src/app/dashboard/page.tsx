"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

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
    items?: LineItem[];
  };
};

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.qty) || 0) * (Number(item.rate) || 0);
  }, 0);
  return subtotal + subtotal * ((Number(doc.data?.taxPercent) || 0) / 100);
}

function monthKey(value: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-teal-400/50 text-teal-300">
      {children}
    </span>
  );
}

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const profileRaw = window.localStorage.getItem("clientready-profile");
      const clientsRaw = window.localStorage.getItem("clientready-clients");
      const docsRaw = window.localStorage.getItem("clientready-documents");
      if (profileRaw) {
        const profile = JSON.parse(profileRaw);
        setOwnerName(profile.ownerName || profile.businessName || "");
      }
      if (clientsRaw) setClients(JSON.parse(clientsRaw));
      if (docsRaw) setDocuments(JSON.parse(docsRaw));

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("owner_name, business_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profileRow) {
        setOwnerName(profileRow.owner_name || profileRow.business_name || "");
      }
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, name, company, email")
        .eq("user_id", user.id);
      if (clientRows) setClients(clientRows as Client[]);
      const { data: docRows } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id);
      if (docRows) {
        setDocuments(
          docRows.map((row) => ({
            id: row.id,
            type: row.type,
            title: row.title || "",
            clientName: row.client_name || "",
            createdAt: row.created_at || "",
            data: row.data || {},
          }))
        );
      }
    }
    load();
  }, []);

  const invoices = documents.filter((doc) => doc.type === "invoice");
  const hour = new Date().getHours();
  const hello =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stats = useMemo(() => {
    const invoiced = invoices.reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const paidDocs = invoices.filter((doc) => doc.data?.status === "paid");
    const paid = paidDocs.reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const overdue = invoices
      .filter((doc) => doc.data?.status === "overdue")
      .reduce((sum, doc) => sum + invoiceTotal(doc), 0);
    const paidRate = invoices.length
      ? Math.round((paidDocs.length / invoices.length) * 100)
      : 0;
    return {
      outstanding: Math.max(invoiced - paid, 0),
      paid,
      overdue,
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

  const width = 520;
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
    window.location.href = "/documents";
  }

  return (
    <AppShell title={`${hello}${ownerName ? `, ${ownerName}` : ""}.`}>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[var(--cr-muted)]">
          Here is what is happening with your invoices today.
        </p>
        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch}>
            <input
              className="min-w-56 rounded-full border border-teal-500/30 bg-[var(--cr-card)] px-4 py-2 text-sm"
              placeholder="Search invoices, clients..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <a
            href="/invoice"
            className="rounded-full border border-teal-400 px-4 py-2 text-sm text-teal-300"
          >
            New invoice +
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <div className="flex items-start justify-between">
            <p className="text-sm text-[var(--cr-muted)]">Total outstanding</p>
            <IconWrap>$</IconWrap>
          </div>
          <p className="mt-3 text-2xl font-semibold">${stats.outstanding.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <div className="flex items-start justify-between">
            <p className="text-sm text-[var(--cr-muted)]">Paid</p>
            <IconWrap>↗</IconWrap>
          </div>
          <p className="mt-3 text-2xl font-semibold">${stats.paid.toFixed(2)}</p>
          <p className="mt-2 text-xs text-teal-400">{stats.paidRate}% marked paid</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <div className="flex items-start justify-between">
            <p className="text-sm text-[var(--cr-muted)]">Overdue</p>
            <IconWrap>⏱</IconWrap>
          </div>
          <p className="mt-3 text-2xl font-semibold">${stats.overdue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <div className="flex items-start justify-between">
            <p className="text-sm text-[var(--cr-muted)]">Clients</p>
            <IconWrap>☺</IconWrap>
          </div>
          <p className="mt-3 text-2xl font-semibold">{clients.length}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Invoice overview</h2>
            <span className="text-sm text-[var(--cr-muted)]">Last 6 months</span>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
            {[1, 2, 3, 4].map((line) => (
              <line
                key={line}
                x1="20"
                x2={width - 20}
                y1={20 + line * 35}
                y2={20 + line * 35}
                stroke="currentColor"
                opacity="0.15"
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
                  opacity="0.6"
                >
                  {point.label}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a href="/invoice" className="rounded-xl border border-teal-500/20 p-3 text-sm">
              <IconWrap>+</IconWrap>
              <p className="mt-2 font-medium">Create invoice</p>
            </a>
            <a href="/collect" className="rounded-xl border border-teal-500/20 p-3 text-sm">
              <IconWrap>$</IconWrap>
              <p className="mt-2 font-medium">Collect</p>
            </a>
            <a href="/profile" className="rounded-xl border border-teal-500/20 p-3 text-sm">
              <IconWrap>⌘</IconWrap>
              <p className="mt-2 font-medium">Payment link</p>
            </a>
            <a href="/calendar" className="rounded-xl border border-teal-500/20 p-3 text-sm">
              <IconWrap>↻</IconWrap>
              <p className="mt-2 font-medium">Calendar</p>
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-5">
        {stats.invoiceCount === 0
          ? "The chart and cards work. They stay at $0 until you save invoices."
          : `${stats.paidRate}% of your invoices are marked paid.`}
      </div>
    </AppShell>
  );
}