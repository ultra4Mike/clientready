"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";

type Receipt = {
  invoiceNumber: string;
  clientName: string;
  amount: string;
  date: string;
  method: string;
};

export default function ReceiptPage() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [businessName, setBusinessName] = useState("Your business");

  useEffect(() => {
    const profileRaw = window.localStorage.getItem("clientready-profile");
    if (profileRaw) {
      const profile = JSON.parse(profileRaw);
      setBusinessName(profile.businessName || "Your business");
    }
    const raw = window.localStorage.getItem("clientready-receipt");
    if (raw) setReceipt(JSON.parse(raw));
  }, []);

  return (
    <AppShell title="Cash receipt">
      <PageHeader title="Cash receipt" subtitle="Print or save this receipt for your customer." actions={<button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 print:hidden"
      >
        Print / Save PDF
      </button>} />
      <div id="preview" className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">Cash receipt</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{businessName}</h1>
        {!receipt ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">No cash receipt yet.</p>
        ) : (
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <div className="flex justify-between gap-4 py-2.5"><span className="text-slate-500">Received from</span><span className="font-medium">{receipt.clientName || "Client"}</span></div>
            <div className="flex justify-between gap-4 py-2.5"><span className="text-slate-500">Invoice</span><span className="font-medium">{receipt.invoiceNumber}</span></div>
            <div className="flex justify-between gap-4 py-2.5"><span className="text-slate-500">Date</span><span className="font-medium">{receipt.date}</span></div>
            <div className="flex justify-between gap-4 py-2.5"><span className="text-slate-500">Method</span><span className="font-medium">Paid in cash</span></div>
            <div className="flex items-baseline justify-between gap-4 py-3"><span className="font-semibold">Amount</span><span className="text-2xl font-bold tabular-nums">${Number(receipt.amount || 0).toFixed(2)}</span></div>
            <p className="py-4 text-xs text-slate-500">This is a payment receipt. It is not a tax form.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}