"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

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
      <button
        type="button"
        onClick={() => window.print()}
        className="mb-4 rounded-lg bg-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-300 print:hidden"
      >
        Print / Save PDF
      </button>
      <div id="preview" className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
        <p className="text-sm uppercase tracking-wide text-slate-500">Cash receipt</p>
        <h1 className="mt-1 text-2xl font-semibold">{businessName}</h1>
        {!receipt ? (
          <p className="mt-6 text-slate-600">No cash receipt yet.</p>
        ) : (
          <div className="mt-6 space-y-2 text-sm">
            <p>Received from: {receipt.clientName || "Client"}</p>
            <p>Invoice: {receipt.invoiceNumber}</p>
            <p>Date: {receipt.date}</p>
            <p>Amount: ${Number(receipt.amount || 0).toFixed(2)}</p>
            <p>Paid in cash</p>
            <p className="pt-6 text-xs text-slate-500">This is a payment receipt. It is not a tax form.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}