"use client";

import { useEffect, useState } from "react";

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
  type: "invoice" | "proposal";
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export default function ProposalPage() {
  const [docId, setDocId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
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
  const [businessName, setBusinessName] = useState("Your business");
  const [ownerName, setOwnerName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (!raw) return;
    const profile = JSON.parse(raw);
    setBusinessName(profile.businessName || "Your business");
    setOwnerName(profile.ownerName || "");
    setBusinessEmail(profile.email || "");
    setBusinessPhone(profile.phone || "");
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-clients");
    if (raw) {
      setSavedClients(JSON.parse(raw));
    }
  }, []);

  useEffect(() => {
    const openId = window.localStorage.getItem("clientready-open-document");
    if (!openId) return;
    const raw = window.localStorage.getItem("clientready-documents");
    if (!raw) return;
    const docs = JSON.parse(raw) as SavedDocument[];
    const doc = docs.find((item) => item.id === openId && item.type === "proposal");
    window.localStorage.removeItem("clientready-open-document");
    if (!doc) return;
    const data = doc.data as {
      clientName?: string;
      clientCompany?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientAddress?: string;
      projectTitle?: string;
      description?: string;
      scope?: string;
      notIncluded?: string;
      timeline?: string;
      price?: string;
      paymentTerms?: string;
      validUntil?: string;
    };
    setDocId(doc.id);
    setClientName(data.clientName || "");
    setClientCompany(data.clientCompany || "");
    setClientEmail(data.clientEmail || "");
    setClientPhone(data.clientPhone || "");
    setClientAddress(data.clientAddress || "");
    setProjectTitle(data.projectTitle || "");
    setDescription(data.description || "");
    setScope(data.scope || "");
    setNotIncluded(data.notIncluded || "");
    setTimeline(data.timeline || "");
    setPrice(data.price || "");
    setPaymentTerms(data.paymentTerms || "50% to start, 50% on completion.");
    setValidUntil(data.validUntil || "");
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
    setClientPhone(client.phone || "");
    setClientAddress(client.address || "");
    setClientSearch(client.name || "");
  }

  function clearForm() {
    setDocId("");
    setClientSearch("");
    setClientName("");
    setClientCompany("");
    setClientEmail("");
    setClientPhone("");
    setClientAddress("");
    setProjectTitle("");
    setDescription("");
    setScope("");
    setNotIncluded("");
    setTimeline("");
    setPrice("");
    setPaymentTerms("50% to start, 50% on completion.");
    setValidUntil("");
    setSaveMessage("");
  }

  function saveDocument() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs: SavedDocument[] = raw ? JSON.parse(raw) : [];
    const id = docId || Date.now().toString();
    const nextDoc: SavedDocument = {
      id,
      type: "proposal",
      title: projectTitle || "Proposal",
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        clientName,
        clientCompany,
        clientEmail,
        clientPhone,
        clientAddress,
        projectTitle,
        description,
        scope,
        notIncluded,
        timeline,
        price,
        paymentTerms,
        validUntil,
      },
    };
    const next = [...docs.filter((item) => item.id !== id), nextDoc];
    window.localStorage.setItem("clientready-documents", JSON.stringify(next));
    setDocId(id);
    setSaveMessage("Proposal saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

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
            placeholder="Client phone"
            value={clientPhone}
            onChange={(event) => setClientPhone(event.target.value)}
          />
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Client address"
            value={clientAddress}
            onChange={(event) => setClientAddress(event.target.value)}
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

          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveDocument}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Save document
            </button>
            <button
              type="button"
              onClick={clearForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Clear form
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
              <p className="text-sm text-slate-600">{clientPhone}</p>
              <p className="text-sm text-slate-600">{clientAddress}</p>
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
        </div>
      </section>
    </main>
  );
}