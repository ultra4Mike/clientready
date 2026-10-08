"use client";

import { useEffect, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";

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

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return ymd(date);
}

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
  const [paymentTerms, setPaymentTerms] = useState("50% to start, 50% on completion.");
  const [validUntil, setValidUntil] = useState("");
  const [businessName, setBusinessName] = useState("Your business");
  const [ownerName, setOwnerName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [logo, setLogo] = useState("");
  const [style, setStyle] = useState("clean");
  const [outcome, setOutcome] = useState("pending");
  const [paymentLink, setPaymentLink] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (!raw) return;
    const profile = JSON.parse(raw);
    setBusinessName(profile.businessName || "Your business");
    setOwnerName(profile.ownerName || "");
    setBusinessEmail(profile.email || "");
    setBusinessPhone(profile.phone || "");
    setLogo(profile.logo || "");
    setPaymentLink(profile.paymentLink || "");
  }, []);

  useEffect(() => {
    async function loadClients() {
      const raw = window.localStorage.getItem("clientready-clients");
      if (raw) setSavedClients(JSON.parse(raw));

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const { data: rows } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id);

      if (!rows) return;
      const next = rows.map((row) => ({
        id: row.id,
        name: row.name || "",
        company: row.company || "",
        email: row.email || "",
        phone: row.phone || "",
        address: row.address || "",
      }));
      setSavedClients(next);
      window.localStorage.setItem("clientready-clients", JSON.stringify(next));
    }
    loadClients();
  }, []);

  useEffect(() => {
    const openId = window.localStorage.getItem("clientready-open-document");
    if (!openId) {
      setValidUntil(plusDays(30));
      return;
    }
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
      style?: string;
      outcome?: string;
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
    setValidUntil(data.validUntil || plusDays(30));
    setClientSearch(data.clientName || "");
    setStyle(data.style || "clean");
    setOutcome(data.outcome || "pending");
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
    setValidUntil(plusDays(30));
    setSaveMessage("");
    setStyle("clean");
    setOutcome("pending");
  }

  async function createInvoiceFromProposal() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    let highest = 1000;
    docs.forEach((doc: { type?: string; title?: string; data?: { invoiceNumber?: string } }) => {
      if (doc.type !== "invoice") return;
      const value = String(doc.data?.invoiceNumber || doc.title || "");
      const match = value.match(/(\d+)/);
      if (match) {
        const num = Number(match[1]);
        if (num > highest) highest = num;
      }
    });

    const invoiceNumber = `INV-${highest + 1}`;
    const localId = Date.now().toString();
    const nextDoc = {
      id: localId,
      type: "invoice",
      title: invoiceNumber,
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        clientName,
        clientCompany,
        clientEmail,
        clientPhone,
        clientAddress,
        invoiceNumber,
        invoiceDate: ymd(new Date()),
        dueDate: plusDays(14),
        notes: paymentTerms || "Payment is due within 14 days.",
        taxPercent: "0",
        items: [
          {
            description: projectTitle || "Work from proposal",
            qty: "1",
            rate: String(price || "0"),
          },
        ],
        status: "draft",
        style,
        jobTime: "",
      },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    window.localStorage.setItem(
      "clientready-documents",
      JSON.stringify([...docs, nextDoc])
    );
    setOutcome("won");
    window.localStorage.setItem("clientready-open-document", cloudId);
    window.location.href = "/invoice";
  }

  async function saveDocument() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const localId = docId || Date.now().toString();
    const nextDoc = {
      id: localId,
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
        style,
        outcome,
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
    setSaveMessage("Proposal saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  const previewClass =
    style === "bold"
      ? "rounded-2xl border border-slate-900 bg-slate-900 p-8 text-white shadow-sm"
      : "rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm";
  const mutedClass = style === "bold" ? "text-slate-300" : "text-slate-600";
  const labelClass = style === "bold" ? "text-slate-400" : "text-slate-500";
  const priceLabel = price
    ? price.trim().startsWith("$")
      ? price
      : `$${Number(price).toFixed(2)}`
    : "$0.00";

  return (
    <AppShell title="New proposal">
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Proposal details</h1>

          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            <option value="clean">Clean professional</option>
            <option value="bold">Bold modern</option>
          </select>

          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>

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
              onClick={createInvoiceFromProposal}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Create invoice
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

          <div id="preview" className={previewClass}>
            {logo && <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />}
            <p className={`text-sm uppercase tracking-wide ${labelClass}`}>Proposal</p>
            <h2 className="mt-1 text-2xl font-semibold">{projectTitle || "Project title"}</h2>
            <p className={`mt-2 text-sm ${mutedClass}`}>Valid until: {validUntil || "-"}</p>

            <div className="mt-8">
              <p className={`text-sm ${labelClass}`}>Prepared for</p>
              <p className="font-medium">{clientName || "Client name"}</p>
              {clientCompany && <p className={`text-sm ${mutedClass}`}>{clientCompany}</p>}
              {clientEmail && <p className={`text-sm ${mutedClass}`}>{clientEmail}</p>}
              {clientPhone && <p className={`text-sm ${mutedClass}`}>{clientPhone}</p>}
              {clientAddress && <p className={`text-sm ${mutedClass}`}>{clientAddress}</p>}
            </div>

            <div className={`mt-4 text-sm ${mutedClass}`}>
              <p className={labelClass}>Prepared by</p>
              <p className="font-medium">{businessName}</p>
              <p>{ownerName}</p>
              <p>{businessEmail}</p>
              <p>{businessPhone}</p>
            </div>

            <div className="mt-8 space-y-4 text-sm leading-6">
              <div>
                <h3 className="font-semibold">Description</h3>
                <p className="whitespace-pre-wrap">{description || "Project description will appear here."}</p>
              </div>
              <div>
                <h3 className="font-semibold">Included</h3>
                <p className="whitespace-pre-wrap">{scope || "Scope will appear here."}</p>
              </div>
              <div>
                <h3 className="font-semibold">Not included</h3>
                <p className="whitespace-pre-wrap">{notIncluded || "-"}</p>
              </div>
              <div>
                <h3 className="font-semibold">Timeline</h3>
                <p>{timeline || "-"}</p>
              </div>
              <div>
                <h3 className="font-semibold">Investment</h3>
                <p className="text-lg font-semibold">{priceLabel}</p>
                <p className="mt-1">{paymentTerms}</p>
                {paymentLink && <p className="mt-2">Pay here: {paymentLink}</p>}
              </div>
              <p className={`pt-4 text-xs ${labelClass}`}>
                This proposal is for planning purposes and is not a signed contract.
              </p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}