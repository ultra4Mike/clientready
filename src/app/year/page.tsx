"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type JobCosts = {
  parts?: string;
  gas?: string;
  driveTime?: string;
  labor?: string;
  tools?: string;
  lunch?: string;
  other?: string;
  notes?: string;
};

type CrewRow = {
  id?: string;
  employeeId?: string;
  name?: string;
  rate?: string;
  hours?: string;
  workDate?: string;
  bonus?: string;
  note?: string;
};

type SavedDocument = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data?: {
    status?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    paymentDate?: string;
    paymentAmount?: string;
    paymentMethod?: string;
    paymentRef?: string;
    taxPercent?: string;
    items?: { qty?: string; rate?: string }[];
    jobCosts?: JobCosts;
    crew?: CrewRow[];
  };
};

type Row = {
  id: string;
  docId: string;
  docType: string;
  kind: "in" | "out" | "pay";
  date: string;
  client: string;
  number: string;
  category: string;
  amount: number;
  method: string;
  ref: string;
  note: string;
  hours?: string;
  rate?: string;
  worker?: string;
};

const costLabels: { key: keyof JobCosts; label: string }[] = [
  { key: "parts", label: "Parts and materials" },
  { key: "gas", label: "Gas and mileage" },
  { key: "driveTime", label: "Drive time" },
  { key: "labor", label: "Labor" },
  { key: "tools", label: "Tools and supplies" },
  { key: "lunch", label: "Meals" },
  { key: "other", label: "Other" },
];

function money(value: unknown) {
  return Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
}

function invoiceTotal(doc: SavedDocument) {
  const items = doc.data?.items || [];
  const subtotal = items.reduce((sum, item) => sum + money(item.qty) * money(item.rate), 0);
  return subtotal + subtotal * (money(doc.data?.taxPercent) / 100);
}

function crewPay(row: CrewRow) {
  return money(row.hours) * money(row.rate) + money(row.bonus);
}

export default function YearPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [businessName, setBusinessName] = useState("Your business");
  const [taxId, setTaxId] = useState("");
  const [setAsidePercent, setSetAsidePercent] = useState(30);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "Your business");
      setTaxId(profile.taxId || "");
      setSetAsidePercent(Number(profile.setAsidePercent) || 30);
    }
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(JSON.parse(raw));
  }, []);

  const rows = useMemo(() => {
    const list: Row[] = [];
    documents.forEach((doc) => {
      const crew = doc.data?.crew || [];
      const hasCrew = crew.some((row) => crewPay(row) > 0);
      if (doc.type === "invoice" && doc.data?.status === "paid") {
        const date = doc.data?.paymentDate || doc.data?.invoiceDate || doc.createdAt || "";
        if (String(date).includes(year) || String(doc.createdAt).includes(year)) {
          list.push({
            id: `in-${doc.id}`,
            docId: doc.id,
            docType: doc.type,
            kind: "in",
            date,
            client: doc.clientName || "No client",
            number: doc.data?.invoiceNumber || doc.title,
            category: "Gross receipts",
            amount: money(doc.data?.paymentAmount) || invoiceTotal(doc),
            method: doc.data?.paymentMethod || "",
            ref: doc.data?.paymentRef || "",
            note: "",
          });
        }
      }
      const costs = doc.data?.jobCosts;
      if (costs) {
        const date = doc.data?.invoiceDate || doc.createdAt || "";
        if (String(date).includes(year) || String(doc.createdAt).includes(year)) {
          costLabels.forEach((item) => {
            if (item.key === "labor" && hasCrew) return;
            const amount = money(costs[item.key]);
            if (!amount) return;
            list.push({
              id: `${doc.id}-${item.key}`,
              docId: doc.id,
              docType: doc.type,
              kind: "out",
              date,
              client: doc.clientName || "No client",
              number: doc.data?.invoiceNumber || doc.title,
              category: item.label,
              amount,
              method: "",
              ref: "",
              note: costs.notes || "",
            });
          });
        }
      }
      crew.forEach((row, index) => {
        const amount = crewPay(row);
        if (!amount) return;
        const date = row.workDate || doc.data?.invoiceDate || doc.createdAt || "";
        if (!String(date).includes(year) && !String(doc.createdAt).includes(year)) return;
        list.push({
          id: `${doc.id}-crew-${row.id || index}`,
          docId: doc.id,
          docType: doc.type,
          kind: "pay",
          date,
          client: doc.clientName || "No client",
          number: doc.data?.invoiceNumber || doc.title,
          category: "Labor",
          amount,
          method: "",
          ref: "",
          note: row.note || "",
          hours: row.hours || "",
          rate: row.rate || "",
          worker: row.name || "Worker",
        });
      });
    });
    return list;
  }, [documents, year]);

  const visible = useMemo(() => {
    const filtered = rows.filter((row) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "in" && row.kind === "in") ||
        (filter === "out" && row.kind === "out") ||
        (filter === "pay" && row.kind === "pay") ||
        row.category === filter ||
        row.worker === filter;
      const haystack = `${row.date} ${row.client} ${row.number} ${row.category} ${row.worker || ""} ${row.method} ${row.ref} ${row.note}`.toLowerCase();
      return matchesFilter && haystack.includes(search.toLowerCase());
    });
    return filtered.sort((a, b) => {
      if (sortBy === "client") return a.client.localeCompare(b.client);
      if (sortBy === "number") return a.number.localeCompare(b.number);
      if (sortBy === "amount") return b.amount - a.amount;
      if (sortBy === "worker") return String(a.worker || "").localeCompare(String(b.worker || ""));
      return String(b.date).localeCompare(String(a.date));
    });
  }, [rows, filter, search, sortBy]);

  const summary = useMemo(() => {
    const collected = rows.filter((row) => row.kind === "in").reduce((sum, row) => sum + row.amount, 0);
    const spent = rows.filter((row) => row.kind === "out" || row.kind === "pay").reduce((sum, row) => sum + row.amount, 0);
    const wages = rows.filter((row) => row.kind === "pay").reduce((sum, row) => sum + row.amount, 0);
    const profit = collected - spent;
    const setAside = profit > 0 ? profit * (setAsidePercent / 100) : 0;
    return { collected, spent, wages, profit, setAside, yours: profit - setAside };
  }, [rows, setAsidePercent]);

  const workers = useMemo(() => {
    const names = Array.from(new Set(rows.filter((row) => row.worker).map((row) => row.worker as string)));
    return names.map((name) => {
      const jobs = rows.filter((row) => row.worker === name);
      return {
        name,
        total: jobs.reduce((sum, row) => sum + row.amount, 0),
        hours: jobs.reduce((sum, row) => sum + money(row.hours), 0),
      };
    });
  }, [rows]);

  function openRow(row: Row) {
    window.localStorage.setItem("clientready-open-document", row.docId);
    window.location.href = row.docType === "proposal" ? "/proposal" : "/invoice";
  }

  return (
    <AppShell title="Year packet">
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={year} onChange={(event) => setYear(event.target.value)} />
        <input className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Search client, invoice, worker" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All rows</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
          <option value="pay">Crew pay</option>
          {workers.map((worker) => (
            <option key={worker.name} value={worker.name}>{worker.name}</option>
          ))}
        </select>
        <select className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="date">Date</option>
          <option value="client">Client</option>
          <option value="number">Invoice</option>
          <option value="amount">Amount</option>
          <option value="worker">Worker</option>
        </select>
      </div>
      <button type="button" onClick={() => window.print()} className="mb-4 rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">
        Print / Save PDF
      </button>

      <div className="mb-6 space-y-2">
        {visible.length === 0 && <p className="text-[var(--cr-muted)]">No rows match that search.</p>}
        {visible.map((row) => (
          <button key={row.id} type="button" onClick={() => openRow(row)} className="block w-full rounded-xl border border-teal-500/20 bg-[var(--cr-card)] p-4 text-left">
            <p className="font-medium">{row.worker ? `${row.worker} · ` : ""}{row.number} · {row.client}</p>
            <p className="text-sm text-[var(--cr-muted)]">
              {row.date} · {row.category} · ${row.amount.toFixed(2)}
              {row.hours ? ` · ${row.hours} hrs @ $${Number(row.rate || 0).toFixed(2)}` : ""} {row.method} {row.ref} {row.note}
            </p>
          </button>
        ))}
      </div>

      <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900">
        <p className="text-sm uppercase tracking-wide text-slate-500">Sales and expense log</p>
        <h1 className="mt-1 text-2xl font-semibold">{businessName}</h1>
        <p className="text-sm text-slate-600">{year}{taxId ? ` · EIN ${taxId}` : ""}</p>
        <p className="mt-4">Collected: ${summary.collected.toFixed(2)}</p>
        <p>Expenses: ${summary.spent.toFixed(2)}</p>
        <p>Crew pay included: ${summary.wages.toFixed(2)}</p>
        <p>Profit: ${summary.profit.toFixed(2)}</p>
        <p>Set aside ({setAsidePercent}%): ${summary.setAside.toFixed(2)}</p>
        <p className="font-semibold">Yours after set-aside: ${summary.yours.toFixed(2)}</p>

        <h2 className="mt-8 font-semibold">Money in</h2>
        {rows.filter((row) => row.kind === "in").map((row) => (
          <p key={row.id} className="mt-2 text-sm">{row.date} · {row.client} · {row.number} · ${row.amount.toFixed(2)} · {row.method} {row.ref}</p>
        ))}

        <h2 className="mt-8 font-semibold">Crew pay</h2>
        {workers.length === 0 && <p className="mt-2 text-sm text-slate-600">No crew pay for this year.</p>}
        {workers.map((worker) => (
          <div key={worker.name} className="mt-4">
            <p className="font-medium">{worker.name}: ${worker.total.toFixed(2)} · {worker.hours.toFixed(2)} hrs</p>
            {rows.filter((row) => row.worker === worker.name).map((row) => (
              <p key={row.id} className="mt-1 text-sm">
                {row.date} · {row.number} · {row.hours || "0"} hrs · ${Number(row.rate || 0).toFixed(2)}/hr · ${row.amount.toFixed(2)} {row.note}
              </p>
            ))}
          </div>
        ))}

        <h2 className="mt-8 font-semibold">Other money out</h2>
        {costLabels.filter((item) => item.key !== "labor").map((item) => {
          const group = rows.filter((row) => row.category === item.label);
          const total = group.reduce((sum, row) => sum + row.amount, 0);
          if (!group.length) return null;
          return (
            <div key={item.key} className="mt-4">
              <p className="font-medium">{item.label}: ${total.toFixed(2)}</p>
              {group.map((row) => (
                <p key={row.id} className="mt-1 text-sm">{row.date} · {row.number} · ${row.amount.toFixed(2)} · {row.note}</p>
              ))}
            </div>
          );
        })}

        <p className="mt-8 text-xs text-slate-500">
          Sales and expense log. Not a tax return. Not tax advice. Meals may not be fully deductible.
          Crew pay uses the rate saved on each job. Use these totals when you or your preparer fill out the return.
        </p>
      </div>
    </AppShell>
  );
}