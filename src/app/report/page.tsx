"use client";

import { useState } from "react";

export default function ReportPage() {
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [completed, setCompleted] = useState("");
  const [status, setStatus] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [issues, setIssues] = useState("");

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/dashboard" className="text-sm text-slate-600">
            Back to dashboard
          </a>
          <div className="font-semibold">New report</div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Report details</h1>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Report title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client or project name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Date range"
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Work completed"
            value={completed}
            onChange={(event) => setCompleted(event.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Current status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Next steps"
            value={nextSteps}
            onChange={(event) => setNextSteps(event.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Issues or blockers"
            value={issues}
            onChange={(event) => setIssues(event.target.value)}
          />
        </form>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Print / Save PDF
        </button>

        <div id="preview" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-wide text-slate-500">Report</p>
          <h2 className="mt-1 text-2xl font-semibold">
            {title || "Report title"}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {clientName || "Client / project"}
          </p>
          <p className="text-sm text-slate-600">{dateRange || "Date range"}</p>

          <div className="mt-8 space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900">Work completed</h3>
              <p className="whitespace-pre-wrap">
                {completed || "Completed work will appear here."}
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Current status</h3>
              <p className="whitespace-pre-wrap">{status || "-"}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Next steps</h3>
              <p className="whitespace-pre-wrap">{nextSteps || "-"}</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Issues</h3>
              <p className="whitespace-pre-wrap">{issues || "None noted."}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}