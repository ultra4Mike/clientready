"use client";

import { useEffect, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";

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

          <div>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Report title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
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

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={saveDocument}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Save document
            </button>
            <button
              type="button"
              onClick={saveClientFromForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Save as client
            </button>
          </div>
          {saveMessage && <p className="text-sm text-slate-600">{saveMessage}</p>}
        </form>

        <div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mb-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
          >
            Print / Save PDF
          </button>

          <div
            id="preview"
            className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            {logo && (
              <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />
            )}
            <p className="text-sm uppercase tracking-wide text-slate-500">Report</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {title || "Report title"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {businessName}
            </p>
            <p className="text-sm text-slate-600">
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
        </div>
      </section>
    </main>
  );
}