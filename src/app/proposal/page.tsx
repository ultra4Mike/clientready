"use client";

import { useState } from "react";

export default function ProposalPage() {
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [notIncluded, setNotIncluded] = useState("");
  const [timeline, setTimeline] = useState("");
  const [price, setPrice] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(
    "50% to start, 50% on completion."
  );
  const [validUntil, setValidUntil] = useState("");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">New proposal</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Proposal details</h1>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client company"
            value={clientCompany}
            onChange={(event) => setClientCompany(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client email"
            value={clientEmail}
            onChange={(event) => setClientEmail(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Project title"
            value={projectTitle}
            onChange={(event) => setProjectTitle(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Project description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="What's included"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="What's not included"
            value={notIncluded}
            onChange={(event) => setNotIncluded(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Timeline"
            value={timeline}
            onChange={(event) => setTimeline(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Payment terms"
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
          />
          <label className="text-sm text-slate-600">
            Valid until
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </label>
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Print / Save PDF
        </button>

        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-500">
            Proposal
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {projectTitle || "Project title"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Valid until: {validUntil || "-"}
          </p>

          <div className="mt-8">
            <p className="text-sm text-slate-500">Prepared for</p>
            <p className="font-medium">{clientName || "Client name"}</p>
            <p className="text-sm text-slate-600">
              {clientCompany || "Company"}
            </p>
            <p className="text-sm text-slate-600">
              {clientEmail || "client@email.com"}
            </p>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            <p className="text-sm text-slate-500">Prepared by</p>
            <p className="font-medium text-slate-900">{businessName}</p>
            <p>{ownerName}</p>
            <p>{businessEmail}</p>
            <p>{businessPhone}</p>
          </div>

          <div className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900">Description</h3>
              <p className="whitespace-pre-wrap">
                {description || "Project description will appear here."}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Included</h3>
              <p className="whitespace-pre-wrap">
                {scope || "Scope will appear here."}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Not included</h3>
              <p className="whitespace-pre-wrap">{notIncluded || "-"}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Timeline</h3>
              <p>{timeline || "-"}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Investment</h3>
              <p className="text-lg font-semibold">{price || "$0.00"}</p>
              <p className="mt-1">{paymentTerms}</p>
            </div>
            <p className="pt-4 text-xs text-slate-500">
              This proposal is for planning purposes and is not a signed
              contract.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}