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
  };
};

const costLabels: { key: keyof JobCosts; label: string }[] = [
  { key: "parts", label: "Parts" },
  { key: "gas", label: "Gas / mileage" },
  { key: "driveTime", label: "Drive time" },
  { key: "labor", label: "Labor / wages" },
  { key: "tools", label: "Tools" },
  { key: "lunch", label: "Lunch / meals" },
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

export default function YearPage() {
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [businessName, setBusinessName] = useState("Your business");
  const [setAsidePercent, setSetAsidePercent] = useState(30);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "Your business");
      setSetAsidePercent(Number(profile.setAsidePercent) || 30);
    }
    const raw = window.localStorage.getItem("clientready-documents");
    if (raw) setDocuments(JSON.parse(raw));
  }, []);

  const packet = useMemo(() => {
    const paid = documents
      .filter((doc) => doc.type === "invoice" && doc.data?.status === "paid")
      .map((doc) => {
        const date = doc.data?.paymentDate || doc.data?.invoiceDate || doc.createdAt || "";
        return {
          id: doc.id,
          date,
          client: doc.clientName || "No client",
          number: doc.data?.invoiceNumber || doc.title,
          amount: money(doc.data?.paymentAmount) || invoiceTotal(doc),
          method: doc.data?.paymentMethod || "",
          ref: doc.data?.paymentRef || "",
        };
      })
      .filter((row) => String(row.date).includes(year));

    const expenses = documents.flatMap((doc) => {
      const costs = doc.data?.jobCosts;
      if (!costs) return [];
      const date = doc.data?.invoiceDate || doc.createdAt || "";
      if (!String(date).includes(year) && !String(doc.createdAt).includes(year)) return [];
      return costLabels
        .map((item) => ({
          id: `${doc.id}-${item.key}`,
          date,
          job: doc.data?.invoiceNumber || doc.title,
          category: item.label,
          amount: money(costs[item.key]),
          note: costs.notes || "",
        }))
        .filter((row) => row.amount > 0);
    });

    const collected = paid.reduce((sum, row) => sum + row.amount, 0);
    const spent = expenses.reduce((sum, row) => sum + row.amount, 0);
    const profit = collected - spent;
    const setAside = profit > 0 ? profit * (setAsidePercent / 100) : 0;
    return { paid, expenses, collected, spent, profit, setAside, yours: profit - setAside };
  }, [documents, setAsidePercent, year]);

  return (
    <AppShell title="Year packet">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Year
          <input
            className="ml-2 rounded-lg border border-teal-500/30 bg-transparent px-3 py-2"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950"
        >
          Print / Save PDF
        </button>
      </div>

      <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-900">
        <p className="text-sm uppercase tracking-wide text-slate-500">Sales and expense log</p>
        <h1 className="mt-1 text-2xl font-semibold">{businessName}</h1>
        <p className="text-sm text-slate-600">{year}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <p>Collected: ${packet.collected.toFixed(2)}</p>
          <p>Expenses: ${packet.spent.toFixed(2)}</p>
          <p>Profit: ${packet.profit.toFixed(2)}</p>
          <p>Set aside ({setAsidePercent}%): ${packet.setAside.toFixed(2)}</p>
        </div>
        <p className="mt-3 font-semibold">Yours after set-aside: ${packet.yours.toFixed(2)}</p>

        <h2 className="mt-8 font-semibold">Money in</h2>
        {packet.paid.length === 0 && <p className="mt-2 text-sm text-slate-600">No paid invoices for this year.</p>}
        {packet.paid.map((row) => (
          <p key={row.id} className="mt-2 text-sm">
            {row.date} · {row.client} · {row.number} · ${row.amount.toFixed(2)} · {row.method} {row.ref}
          </p>
        ))}

        <h2 className="mt-8 font-semibold">Money out</h2>
        {packet.expenses.length === 0 && <p className="mt-2 text-sm text-slate-600">No job costs for this year.</p>}
        {packet.expenses.map((row) => (
          <p key={row.id} className="mt-2 text-sm">
            {row.date} · {row.job} · {row.category} · ${row.amount.toFixed(2)} · {row.note}
          </p>
        ))}

        <p className="mt-8 text-xs text-slate-500">
          Sales and expense log. Not a tax return. Not tax advice. Set-aside is an estimate so April is not a surprise.
        </p>
      </div>
    </AppShell>
  );
}