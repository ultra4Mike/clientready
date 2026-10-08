"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";

type LineItem = {
  description: string;
  qty: string;
  rate: string;
};

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

const emptyItem: LineItem = { description: "", qty: "1", rate: "" };

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

export default function NewInvoicePage() {
  const [docId, setDocId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-1001");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("Payment is due within 14 days.");
  const [taxPercent, setTaxPercent] = useState("0");
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [businessName, setBusinessName] = useState("Your business");
  const [ownerName, setOwnerName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [status, setStatus] = useState("draft");
  const [logo, setLogo] = useState("");
  const [style, setStyle] = useState("clean");
  const [paymentLink, setPaymentLink] = useState("");
  const [jobTime, setJobTime] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-profile");
    if (!raw) return;
    const profile = JSON.parse(raw);
    setBusinessName(profile.businessName || "Your business");
    setOwnerName(profile.ownerName || "");
    setBusinessEmail(profile.email || "");
    setBusinessPhone(profile.phone || "");
    setPaymentLink(profile.paymentLink || "");
    setLogo(profile.logo || "");
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
    const raw = window.localStorage.getItem("clientready-documents");

    if (!openId) {
      const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
      let highest = 1000;
      docs.forEach((doc) => {
        if (doc.type !== "invoice") return;
        const value = String(doc.data?.invoiceNumber || doc.title || "");
        const match = value.match(/(\d+)/);
        if (match) {
          const num = Number(match[1]);
          if (num > highest) highest = num;
        }
      });
      setInvoiceNumber(`INV-${highest + 1}`);
      setInvoiceDate(ymd(new Date()));
      setDueDate(plusDays(14));
      return;
    }

    if (!raw) return;
    const docs = JSON.parse(raw) as SavedDocument[];
    const doc = docs.find((item) => item.id === openId && item.type === "invoice");
    window.localStorage.removeItem("clientready-open-document");
    if (!doc) return;
    const data = doc.data as {
      clientName?: string;
      clientCompany?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientAddress?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      dueDate?: string;
      notes?: string;
      taxPercent?: string;
      items?: LineItem[];
      status?: string;
      style?: string;
      jobTime?: string;
    };
    setDocId(doc.id);
    setClientName(data.clientName || "");
    setClientCompany(data.clientCompany || "");
    setClientEmail(data.clientEmail || "");
    setClientPhone(data.clientPhone || "");
    setClientAddress(data.clientAddress || "");
    setInvoiceNumber(data.invoiceNumber || "INV-1001");
    setInvoiceDate(data.invoiceDate || ymd(new Date()));
    setDueDate(data.dueDate || plusDays(14));
    setNotes(data.notes || "Payment is due within 14 days.");
    setTaxPercent(data.taxPercent || "0");
    setItems(data.items?.length ? data.items : [{ ...emptyItem }]);
    setClientSearch(data.clientName || "");
    setStatus(data.status || "draft");
    setStyle(data.style || "clean");
    setJobTime(data.jobTime || "");
  }, []);

  const filteredClients = savedClients.filter((client) => {
    if (!clientSearch.trim()) return false;
    const text = `${client.name} ${client.company} ${client.email}`.toLowerCase();
    return text.includes(clientSearch.toLowerCase());
  });

  function getNextInvoiceNumber() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
    let highest = 1000;
    docs.forEach((doc) => {
      if (doc.type !== "invoice") return;
      const value = String(doc.data?.invoiceNumber || doc.title || "");
      const match = value.match(/(\d+)/);
      if (match) {
        const num = Number(match[1]);
        if (num > highest) highest = num;
      }
    });
    return `INV-${highest + 1}`;
  }

  function chooseClient(client: SavedClient) {
    setClientName(client.name || "");
    setClientCompany(client.company || "");
    setClientEmail(client.email || "");
    setClientPhone(client.phone || "");
    setClientAddress(client.address || "");
    setClientSearch(client.name || "");
  }

  function saveClientFromForm() {
    if (!clientName.trim()) {
      setSaveMessage("Add a client name first");
      return;
    }

    const raw = window.localStorage.getItem("clientready-clients");
    const clients: SavedClient[] = raw ? JSON.parse(raw) : [];
    const alreadySaved = clients.some((client) => {
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
      phone: clientPhone,
      address: clientAddress,
    };
    const next = [...clients, nextClient];
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
    setSavedClients(next);
    setSaveMessage("Client saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  function clearForm() {
    setDocId("");
    setClientSearch("");
    setClientName("");
    setClientCompany("");
    setClientEmail("");
    setClientPhone("");
    setClientAddress("");
    setInvoiceNumber(getNextInvoiceNumber());
    setInvoiceDate(ymd(new Date()));
    setDueDate(plusDays(14));
    setNotes("Payment is due within 14 days.");
    setTaxPercent("0");
    setItems([{ ...emptyItem }]);
    setSaveMessage("");
    setStatus("draft");
    setStyle("clean");
    setJobTime("");
  }

  async function saveDocument() {
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const localId = docId || Date.now().toString();
    const nextDoc = {
      id: localId,
      type: "invoice",
      title: invoiceNumber || "Invoice",
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        clientName,
        clientCompany,
        clientEmail,
        clientPhone,
        clientAddress,
        invoiceNumber,
        invoiceDate,
        dueDate,
        notes,
        taxPercent,
        items,
        status,
        style,
        jobTime,
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
    setSaveMessage("Invoice saved");
    setTimeout(() => setSaveMessage(""), 2000);
  }

  async function copyPayLink() {
    if (!paymentLink.trim()) {
      window.location.href = "/profile";
      return;
    }
    try {
      await navigator.clipboard.writeText(paymentLink);
      setSaveMessage("Pay link copied");
    } catch {
      setSaveMessage(paymentLink);
    }
    setTimeout(() => setSaveMessage(""), 2000);
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      return sum + qty * rate;
    }, 0);
    const tax = subtotal * ((Number(taxPercent) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxPercent]);

  const previewClass =
    style === "bold"
      ? "rounded-2xl border border-slate-900 bg-slate-900 p-8 text-white shadow-sm"
      : "rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm";

  const mutedClass = style === "bold" ? "text-slate-300" : "text-slate-600";
  const labelClass = style === "bold" ? "text-slate-400" : "text-slate-500";

  return (
    <AppShell title="New invoice">
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Invoice details</h1>

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
          <button
            type="button"
            onClick={saveClientFromForm}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Save as client
          </button>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Invoice number"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />

          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>

          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
          >
            <option value="clean">Clean professional</option>
            <option value="bold">Bold modern</option>
          </select>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Invoice date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-600">
              Due date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Line items</h2>
              <button
                type="button"
                className="text-sm text-slate-700"
                onClick={() => setItems((current) => [...current, { ...emptyItem }])}
              >
                Add item
              </button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-3">
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Description"
                  value={item.description}
                  onChange={(event) =>
                    updateItem(index, "description", event.target.value)
                  }
                />
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={(event) => updateItem(index, "qty", event.target.value)}
                />
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Rate"
                  value={item.rate}
                  onChange={(event) => updateItem(index, "rate", event.target.value)}
                />
              </div>
            ))}
          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Tax percent"
            value={taxPercent}
            onChange={(event) => setTaxPercent(event.target.value)}
          />
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
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
              onClick={clearForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Clear form
            </button>
          </div>
          {saveMessage && <p className="text-sm text-slate-600">{saveMessage}</p>}
        </form>

        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Print / Save PDF
            </button>
            {status !== "paid" && (
              <button
                type="button"
                onClick={copyPayLink}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                {paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}
              </button>
            )}
          </div>

          <div id="preview" className={previewClass}>
            {logo && (
              <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />
            )}
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm uppercase tracking-wide ${labelClass}`}>Invoice</p>
                <h2 className="mt-1 text-2xl font-semibold">{invoiceNumber || "INV-0000"}</h2>
                <div className={`mt-4 text-sm ${mutedClass}`}>
                  <p className="font-medium">{businessName}</p>
                  <p>{ownerName}</p>
                  <p>{businessEmail}</p>
                  <p>{businessPhone}</p>
                </div>
              </div>
              <div className={`text-right text-sm ${mutedClass}`}>
                <div>Date: {invoiceDate || "-"}</div>
                <div>Due: {dueDate || "-"}</div>
                {jobTime && <div>Time: {jobTime}</div>}
              </div>
            </div>

            <div className="mt-8">
              <p className={`text-sm ${labelClass}`}>Bill to</p>
              <p className="font-medium">{clientName || "Client name"}</p>
              {clientCompany && <p className={`text-sm ${mutedClass}`}>{clientCompany}</p>}
              {clientEmail && <p className={`text-sm ${mutedClass}`}>{clientEmail}</p>}
              {clientPhone && <p className={`text-sm ${mutedClass}`}>{clientPhone}</p>}
              {clientAddress && <p className={`text-sm ${mutedClass}`}>{clientAddress}</p>}
            </div>

            <div className="mt-8 border-t border-slate-500 pt-4">
              {items.map((item, index) => {
                const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                return (
                  <div key={index} className="flex justify-between py-2 text-sm">
                    <span>{item.description || "Item"}</span>
                    <span>${amount.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 space-y-1 border-t border-slate-500 pt-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>${totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>${totals.total.toFixed(2)}</span>
              </div>
            </div>

            <p className={`mt-8 text-sm ${mutedClass}`}>{notes}</p>
            {paymentLink && (
              <p className={`mt-4 text-sm ${mutedClass}`}>Pay here: {paymentLink}</p>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}