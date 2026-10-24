"use client";

import { useEffect, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";

type SavedClient = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
};

type SavedDocument = {
  id: string;
  type: "invoice" | "proposal" | "email" | "report";
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export default function ReportPage() {
  const [docId, setDocId] = useState("");
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [completed, setCompleted] = useState("");
  const [status, setStatus] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [issues, setIssues] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [logo, setLogo] = useState("");
  const [businessName, setBusinessName] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (raw) {
      const profile = JSON.parse(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
      setLogo(profile.logo || "");
      setBusinessName(profile.businessName || "");
    }
    const clientsRaw = window.localStorage.getItem("clientready-clients");
    if (clientsRaw) setSavedClients(JSON.parse(clientsRaw));
  }, []);

  useEffect(() => {
    const openId = window.localStorage.getItem("clientready-open-document");
    if (!openId) return;
    const raw = window.localStorage.getItem("clientready-documents");
    if (!raw) return;
    const docs = JSON.parse(raw) as SavedDocument[];
    const doc = docs.find((item) => item.id === openId && item.type === "report");
    window.localStorage.removeItem("clientready-open-document");
    if (!doc) return;
    const data = doc.data as {
      title?: string;
      clientName?: string;
      clientCompany?: string;
      clientEmail?: string;
      dateRange?: string;
      completed?: string;
      status?: string;
      nextSteps?: string;
      issues?: string;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time read of browser storage/URL; must run after hydration, so it stays in the effect
    setDocId(doc.id);
    setTitle(data.title || "");
    setClientName(data.clientName || "");
    setClientCompany(data.clientCompany || "");
    setClientEmail(data.clientEmail || "");
    setDateRange(data.dateRange || "");
    setCompleted(data.completed || "");
    setStatus(data.status || "");
    setNextSteps(data.nextSteps || "");
    setIssues(data.issues || "");
    setClientSearch(data.clientName || "");
  }, []);

  const filteredClients = savedClients.filter((client) => {
    if (!clientSearch.trim()) return false;
    const text = `${client.name} ${client.company} ${client.email}`.toLowerCase();
    return text.includes(clientSearch.toLowerCase());
  });

  function chooseClient(client: SavedClient) {
    setClientName(client.name || "");
    setClientCompany(client.company || "");
    setClientEmail(client.email || "");
    setClientSearch(client.name || "");
  }

  function saveClientFromForm() {
    if (!clientName.trim()) {
      setSaveMessage("Add a client name first");
      return;
    }
    const alreadySaved = savedClients.some((client) => {
      if (clientEmail && client.email) {
        return client.email.toLowerCase() === clientEmail.toLowerCase();
      }
      return client.name.toLowerCase() === clientName.toLowerCase();
    });
    if (alreadySaved) {
      setSaveMessage("That client is already saved");
      setTimeout(() => setSaveMessage(""), 2000);
      return;
    }
    const nextClient: SavedClient = {
      id: Date.now().toString(),
      name: clientName,
      company: clientCompany,
      email: clientEmail,
      phone: "",
      address: "",
    };
    const next = [...savedClients, nextClient];
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
    setSavedClients(next);
    setSaveMessage("Client saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

async function saveDocument() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const localId = docId || Date.now().toString();
    const nextDoc = {
      id: localId,
      type: "report",
      title: title || "Report",
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        title,
        clientName,
        clientCompany,
        clientEmail,
        dateRange,
        completed,
        status,
        nextSteps,
        issues,
      },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    const next = [
      ...docs.filter(
        (item: { id: string }) => item.id !== localId && item.id !== cloudId
      ),
      nextDoc,
    ];
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
    setDocId(cloudId);
    setSaveMessage("Report saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  return (
    <AppShell title="Report">
      <PageHeader title="Report" subtitle="Build a progress report for a client, then print or save it." />

      <section className="mx-auto grid max-w-6xl gap-6 py-2 sm:py-4 lg:grid-cols-2 lg:gap-8">
        <form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">Report details</h2>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Client & period</h2>
          <div>
            <input
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              placeholder="Search clients by name"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
            />
            {filteredClients.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                {filteredClients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => chooseClient(client)}
                    className="block w-full border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0 hover:bg-teal-500/10"
                  >
                    <span className="block font-medium">{client.name}</span>
                    <span className="block text-sm text-slate-500">
                      {client.company || client.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Report title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Client name"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
          <input
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Client company"
            value={clientCompany}
            onChange={(event) => setClientCompany(event.target.value)}
          />
          <input
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Date range"
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value)}
          />
          </div>
          <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Progress</h2>
                    <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Work completed"
            value={completed}
            onChange={(event) => setCompleted(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Current status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Next steps"
            value={nextSteps}
            onChange={(event) => setNextSteps(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
            placeholder="Issues or blockers"
            value={issues}
            onChange={(event) => setIssues(event.target.value)}
          />
          </div>

          <div className="mobile-savebar print-hide sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col gap-3 rounded-b-2xl border-t border-slate-200 bg-[var(--cr-card)] px-4 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:px-6">
            <button
              type="button"
              onClick={saveDocument}
              className="min-h-11 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50"
            >
              Save document
            </button>
            <button
              type="button"
              onClick={saveClientFromForm}
              className="min-h-11 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600"
            >
              Save as client
            </button>
          </div>
          {saveMessage && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-slate-600">{saveMessage}</p>}
        </form>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <button
            type="button"
            onClick={() => window.print()}
            className="print-hide mb-4 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"
          >
            Print / Save PDF
          </button>

          <div
            id="preview"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
          >
            {logo && (
              <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />
            )}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              {title || "Report title"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {businessName}
            </p>
            <p className="text-sm text-slate-600">
              {clientName || "Client / project"}
            </p>
            <p className="text-sm text-slate-600">{dateRange || "Date range"}</p>

            <div className="mt-6 space-y-5 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-700">
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-900">Work completed</h3>
                <p className="whitespace-pre-wrap">
                  {completed || "Completed work will appear here."}
                </p>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-900">Current status</h3>
                <p className="whitespace-pre-wrap">{status || "-"}</p>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-900">Next steps</h3>
                <p className="whitespace-pre-wrap">{nextSteps || "-"}</p>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-900">Issues</h3>
                <p className="whitespace-pre-wrap">{issues || "None noted."}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}