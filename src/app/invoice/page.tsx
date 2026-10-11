"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { getTrialState } from "@/lib/trial";
import { saveCrewJobs } from "@/lib/crew";

type LineItem = { description: string; qty: string; rate: string };
type SavedClient = { id: string; name: string; company: string; email: string; phone: string; address: string };
type SavedDocument = { id: string; type: "invoice" | "proposal"; title: string; clientName: string; createdAt: string; data: Record<string, unknown> };
type OtherFee = { id: string; name: string; amount: string };
type JobCosts = {
  parts: string;
  gas: string;
  driveHours: string;
  driveMinutes: string;
  labor: string;
  tools: string;
  lunch: string;
  otherFees: OtherFee[];
  notes: string;
};
type Employee = { id: string; name: string; rate: string; active: boolean };
type CrewRow = {
  id: string;
  employeeId: string;
  name: string;
  rate: string;
  hours: string;
  startTime: string;
  endTime: string;
  workDate: string;
  note: string;
  bonus: string;
  paidToWorker: boolean;
  paidDate: string;
};
type DocKind = "invoice" | "proposal";

const emptyItem: LineItem = { description: "", qty: "1", rate: "" };
const emptyCosts: JobCosts = {
  parts: "",
  gas: "",
  driveHours: "",
  driveMinutes: "",
  labor: "",
  tools: "",
  lunch: "",
  otherFees: [],
  notes: "",
};

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return ymd(date);
}
function money(value: string) {
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}
function hoursBetween(start: string, end: string) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return "";
  return (mins / 60).toFixed(2);
}
function rowPay(row: CrewRow) {
  return money(row.hours) * money(row.rate) + money(row.bonus);
}
function nextNumber(kind: DocKind) {
  const raw = window.localStorage.getItem("clientready-documents");
  const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
  let highest = 1000;
  docs.forEach((doc) => {
    if (doc.type !== kind) return;
    const match = String(doc.data?.invoiceNumber || doc.title || "").match(/(\d+)/);
    if (match && Number(match[1]) > highest) highest = Number(match[1]);
  });
  return `${kind === "proposal" ? "PROP" : "INV"}-${highest + 1}`;
}

export default function NewInvoicePage() {
  const [docId, setDocId] = useState("");
  const [docKind, setDocKind] = useState<DocKind>("invoice");
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-1001");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [jobStart, setJobStart] = useState("");
  const [jobEnd, setJobEnd] = useState("");
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
  const [costs, setCosts] = useState<JobCosts>(emptyCosts);
  const [setAsidePercent, setSetAsidePercent] = useState("30");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crew, setCrew] = useState<CrewRow[]>([]);
  const [pickedEmployee, setPickedEmployee] = useState("");
  const [otherFees, setOtherFees] = useState<OtherFee[]>([]);
  const [locked, setLocked] = useState(false);
  const [daysLeft, setDaysLeft] = useState(14);

  const isProposal = docKind === "proposal";

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
    setSetAsidePercent(profile.setAsidePercent || "30");
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem("clientready-employees");
    if (raw) setEmployees(JSON.parse(raw));
  }, []);

  useEffect(() => {
    getTrialState().then((trial) => {
      setLocked(trial.expired);
      setDaysLeft(trial.daysLeft);
    });
  }, []);

  useEffect(() => {
    async function loadClients() {
      const raw = window.localStorage.getItem("clientready-clients");
      if (raw) setSavedClients(JSON.parse(raw));
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: rows } = await supabase.from("clients").select("*").eq("user_id", user.id);
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
    try {
      const openId = window.localStorage.getItem("clientready-open-document");
      const raw = window.localStorage.getItem("clientready-documents");
      const wanted = window.localStorage.getItem("clientready-new-type");
      if (!openId) {
        const kind: DocKind = wanted === "proposal" ? "proposal" : "invoice";
        window.localStorage.removeItem("clientready-new-type");
        setDocKind(kind);
        setInvoiceNumber(nextNumber(kind));
        setInvoiceDate(ymd(new Date()));
        setDueDate(plusDays(14));
        setNotes(kind === "proposal" ? "This proposal is valid for 14 days." : "Payment is due within 14 days.");
        return;
      }
      if (!raw) return;
      const docs = JSON.parse(raw) as SavedDocument[];
      const doc = docs.find((item) => item.id === openId && (item.type === "invoice" || item.type === "proposal"));
      window.localStorage.removeItem("clientready-open-document");
      if (!doc) return;
      const data = (doc.data || {}) as {
        clientName?: string; clientCompany?: string; clientEmail?: string; clientPhone?: string; clientAddress?: string;
        invoiceNumber?: string; invoiceDate?: string; dueDate?: string; jobStart?: string; jobEnd?: string; notes?: string;
        taxPercent?: string; items?: LineItem[]; status?: string; style?: string; jobTime?: string; jobCosts?: JobCosts; crew?: CrewRow[];
      };
      const kind: DocKind = doc.type === "proposal" ? "proposal" : "invoice";
      const loadedItems = Array.isArray(data.items) && data.items.length ? data.items : [{ ...emptyItem }];
      const loadedCrew = Array.isArray(data.crew) ? data.crew : [];
      const loadedFees = Array.isArray(data.jobCosts?.otherFees) ? data.jobCosts.otherFees : [];
      setDocKind(kind);
      setDocId(doc.id);
      setClientName(data.clientName || "");
      setClientCompany(data.clientCompany || "");
      setClientEmail(data.clientEmail || "");
      setClientPhone(data.clientPhone || "");
      setClientAddress(data.clientAddress || "");
      setInvoiceNumber(data.invoiceNumber || (kind === "proposal" ? "PROP-1001" : "INV-1001"));
      setInvoiceDate(data.invoiceDate || ymd(new Date()));
      setDueDate(data.dueDate || plusDays(14));
      setJobStart(data.jobStart || "");
      setJobEnd(data.jobEnd || "");
      setNotes(data.notes || (kind === "proposal" ? "This proposal is valid for 14 days." : "Payment is due within 14 days."));
      setTaxPercent(data.taxPercent || "0");
      setItems(loadedItems);
      setClientSearch(data.clientName || "");
      setStatus(data.status || "draft");
      setStyle(data.style || "clean");
      setJobTime(data.jobTime || "");
      setCosts({ ...emptyCosts, ...(data.jobCosts || {}), otherFees: loadedFees });
      setOtherFees(loadedFees);
      setCrew(loadedCrew.map((row) => ({ ...row, bonus: row.bonus || "" })));
    } catch {
      window.localStorage.removeItem("clientready-open-document");
      setSaveMessage("Could not open that document.");
    }
  }, []);

  useEffect(() => {
    if (!crew.length) return;
    const labor = crew.reduce((sum, row) => sum + rowPay(row), 0);
    setCosts((current) => ({ ...current, labor: labor.toFixed(2) }));
  }, [crew]);

  const filteredClients = savedClients.filter((client) => {
    if (!clientSearch.trim()) return false;
    return `${client.name} ${client.company} ${client.email}`.toLowerCase().includes(clientSearch.toLowerCase());
  });
  
  function chooseKind(kind: DocKind) {
    if (locked) return;
    setDocKind(kind);
    if (!docId) setInvoiceNumber(nextNumber(kind));
    if (kind === "proposal" && (status === "paid" || status === "overdue")) setStatus("sent");
    setNotes(kind === "proposal" ? "This proposal is valid for 14 days." : "Payment is due within 14 days.");
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
    if (!clientName.trim()) return setSaveMessage("Add a client name first");
    const raw = window.localStorage.getItem("clientready-clients");
    const clients: SavedClient[] = raw ? JSON.parse(raw) : [];
    const alreadySaved = clients.some((client) => clientEmail && client.email ? client.email.toLowerCase() === clientEmail.toLowerCase() : client.name.toLowerCase() === clientName.toLowerCase());
    if (alreadySaved) return setSaveMessage("That client is already saved");
    const next = [...clients, { id: Date.now().toString(), name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone, address: clientAddress }];
    window.localStorage.setItem("clientready-clients", JSON.stringify(next));
    setSavedClients(next);
    setSaveMessage("Client saved");
  }

  function allowCrewChange() {
    if (status !== "paid") return true;
    return window.confirm("This invoice is paid. Changing crew pay can make the year log wrong. Continue?");
  }

  function addCrew() {
    const person = employees.find((item) => item.id === pickedEmployee);
    if (!person) return setSaveMessage("Pick an employee, then click Add");
    if (!allowCrewChange()) return;
    const nextCrew = [...crew, {
      id: Date.now().toString(), employeeId: person.id, name: person.name, rate: person.rate,
      hours: "", startTime: jobStart, endTime: jobEnd, workDate: invoiceDate, note: "", bonus: "", paidToWorker: false, paidDate: "",
    }];
    setCrew(nextCrew);
    setCosts((current) => ({ ...current, labor: nextCrew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) }));
    setPickedEmployee("");
    setSaveMessage(`${person.name} added. Pick the next person and click Add again.`);
  }

  function updateCrew(id: string, patch: Partial<CrewRow>) {
    if (!allowCrewChange()) return;
    setCrew((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.startTime || patch.endTime) {
        const hours = hoursBetween(next.startTime, next.endTime);
        if (hours) next.hours = hours;
      }
      return next;
    }));
  }

  function clearForm() {
    if (locked) return;
    setDocId(""); setClientSearch(""); setClientName(""); setClientCompany(""); setClientEmail(""); setClientPhone(""); setClientAddress("");
    setInvoiceNumber(nextNumber(docKind)); setInvoiceDate(ymd(new Date())); setDueDate(plusDays(14)); setJobStart(""); setJobEnd("");
    setNotes(isProposal ? "This proposal is valid for 14 days." : "Payment is due within 14 days.");
    setTaxPercent("0"); setItems([{ ...emptyItem }]); setSaveMessage(""); setStatus("draft");
    setStyle("clean"); setJobTime(""); setCosts(emptyCosts); setCrew([]); setOtherFees([]);
  }

  async function saveDocument() {
    if (locked) {
      setSaveMessage("Trial ended. Subscribe to save. $7.99/mo or $19.99 for 3 months.");
      return;
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const localId = docId || Date.now().toString();
    const labor = crew.length ? crew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) : costs.labor;
    const nextDoc = {
      id: localId,
      type: docKind,
      title: invoiceNumber || (isProposal ? "Proposal" : "Invoice"),
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: { clientName, clientCompany, clientEmail, clientPhone, clientAddress, invoiceNumber, invoiceDate, dueDate, jobStart, jobEnd, notes, taxPercent, items, status, style, jobTime, jobCosts: { ...costs, labor, otherFees }, crew },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    window.localStorage.setItem("clientready-documents", JSON.stringify([...docs.filter((item: { id: string }) => item.id !== localId && item.id !== cloudId), nextDoc]));
    setDocId(cloudId);
    await saveCrewJobs(cloudId, invoiceNumber, crew);
    setSaveMessage(isProposal ? "Proposal saved" : "Invoice saved");
  }

  async function createInvoiceFromProposal() {
    if (locked) {
      setSaveMessage("Trial ended. Subscribe to save. $7.99/mo or $19.99 for 3 months.");
      return;
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const number = nextNumber("invoice");
    const labor = crew.length ? crew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) : costs.labor;
    const nextDoc = {
      id: Date.now().toString(),
      type: "invoice",
      title: number,
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        clientName, clientCompany, clientEmail, clientPhone, clientAddress,
        invoiceNumber: number, invoiceDate: ymd(new Date()), dueDate: plusDays(14),
        jobStart, jobEnd, notes: "Payment is due within 14 days.", taxPercent, items,
        status: "draft", style, jobTime, jobCosts: { ...costs, labor, otherFees }, crew,
      },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    window.localStorage.setItem("clientready-documents", JSON.stringify([...docs, nextDoc]));
    window.localStorage.setItem("clientready-open-document", cloudId);
    window.location.href = "/invoice";
  }

  async function copyPayLink() {
    if (!paymentLink.trim()) return (window.location.href = "/profile");
    try { await navigator.clipboard.writeText(paymentLink); setSaveMessage("Pay link copied"); } catch { setSaveMessage(paymentLink); }
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
    const tax = subtotal * ((Number(taxPercent) || 0) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxPercent]);

  const jobMath = useMemo(() => {
    const otherTotal = otherFees.reduce((sum, fee) => sum + money(fee.amount), 0);
    const jobCost = money(costs.parts) + money(costs.gas) + money(costs.labor) + money(costs.tools) + money(costs.lunch) + otherTotal;
    const leftOver = totals.total - jobCost;
    const setAside = leftOver > 0 ? leftOver * ((Number(setAsidePercent) || 0) / 100) : 0;
    return { jobCost, leftOver, setAside, yours: leftOver - setAside };
  }, [costs, otherFees, totals.total, setAsidePercent]);

  const previewClass = style === "bold" ? "rounded-2xl border border-slate-900 bg-slate-900 p-8 text-white shadow-sm" : "rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm";
  const mutedClass = style === "bold" ? "text-slate-300" : "text-slate-600";
  const labelClass = style === "bold" ? "text-slate-400" : "text-slate-500";

  return (
    <AppShell title={isProposal ? "New proposal" : "New invoice"}>
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-2">
        <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
{locked && (
            <p
              className="rounded-lg border p-3 text-sm"
              style={{ background: "#fef3c7", color: "#0f172a", borderColor: "#f59e0b" }}
            >
              Trial ended. You can view and print old documents. New saves are locked.
              $7.99 a month or $19.99 for 3 months.
            </p>
          )}
          {!locked && daysLeft <= 5 && (
            <p className="text-sm text-slate-600">{daysLeft} day{daysLeft === 1 ? "" : "s"} left in the trial.</p>
          )}
          <fieldset disabled={locked} className="min-w-0 space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => chooseKind("invoice")} className={`rounded-lg px-4 py-2 text-sm ${!isProposal ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Invoice</button>
              <button type="button" onClick={() => chooseKind("proposal")} className={`rounded-lg px-4 py-2 text-sm ${isProposal ? "bg-slate-900 text-white" : "border border-slate-300"}`}>Proposal</button>
            </div>
            <h1 className="text-xl font-semibold">{isProposal ? "Proposal details" : "Invoice details"}</h1>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Search clients by name" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} />
            {filteredClients.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {filteredClients.map((client) => (
                  <button key={client.id} type="button" onClick={() => chooseClient(client)} className="block w-full border-b border-slate-100 px-3 py-2 text-left">
                    <span className="block font-medium">{client.name}</span>
                    <span className="block text-sm text-slate-500">{client.company || client.email}</span>
                  </button>
                ))}
              </div>
            )}
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Client name" value={clientName} onChange={(event) => setClientName(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Client company" value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Client email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Client phone" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Client address" value={clientAddress} onChange={(event) => setClientAddress(event.target.value)} />
            <button type="button" onClick={saveClientFromForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Save as client</button>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={isProposal ? "Proposal number" : "Invoice number"} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              {isProposal ? <option value="accepted">Accepted</option> : <><option value="paid">Paid</option><option value="overdue">Overdue</option></>}
            </select>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="clean">Clean professional</option><option value="bold">Bold modern</option>
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">{isProposal ? "Proposal date" : "Invoice date"}<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
              <label className="text-sm text-slate-600">{isProposal ? "Valid until" : "Due date"}<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label className="text-sm text-slate-600">Job start<input type="time" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={jobStart} onChange={(event) => setJobStart(event.target.value)} /></label>
              <label className="text-sm text-slate-600">Job end<input type="time" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={jobEnd} onChange={(event) => setJobEnd(event.target.value)} /></label>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="font-medium">Line items</h2><button type="button" className="text-sm" onClick={() => setItems((current) => [...current, { ...emptyItem }])}>Add item</button></div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-3">
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Description" value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Qty" value={item.qty} onChange={(event) => updateItem(index, "qty", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Rate" value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} />
                </div>
              ))}
            </div>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Tax percent" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} />
            <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            <div className="owner-costs space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">
              <h2 className="font-medium">Your costs only</h2>
              <p className="text-sm text-slate-600">Wages fill from hours times the saved rate, plus any extra pay.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Parts<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={costs.parts} onChange={(event) => setCosts({ ...costs, parts: event.target.value })} /></label>
                <label className="text-sm">Gas / diesel<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Receipt amount" value={costs.gas} onChange={(event) => setCosts({ ...costs, gas: event.target.value })} /></label>
                <label className="text-sm">
                  Drive time
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Hours" value={costs.driveHours} onChange={(event) => setCosts({ ...costs, driveHours: event.target.value })} />
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Minutes" value={costs.driveMinutes} onChange={(event) => setCosts({ ...costs, driveMinutes: event.target.value })} />
                  </div>
                </label>
                <label className="text-sm">Labor / wages<input className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2" value={costs.labor} readOnly={crew.length > 0} onChange={(event) => setCosts({ ...costs, labor: event.target.value })} /></label>
                <label className="text-sm">Job supplies<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Bags, blades, gloves" value={costs.tools} onChange={(event) => setCosts({ ...costs, tools: event.target.value })} /></label>
                <label className="text-sm">Lunch / meals cost<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={costs.lunch} onChange={(event) => setCosts({ ...costs, lunch: event.target.value })} /></label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">Other fees</p>
                  <button type="button" className="rounded-lg bg-teal-400 px-3 py-1 text-sm font-medium text-slate-950" onClick={() => setOtherFees((current) => [...current, { id: Date.now().toString(), name: "", amount: "" }])}>Add fee</button>
                </div>
                {otherFees.map((fee) => (
                  <div key={fee.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                    <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Dump fee, permit, parking" value={fee.name} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, name: event.target.value } : item))} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Cost" value={fee.amount} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, amount: event.target.value } : item))} />
                    <button type="button" className="text-sm" onClick={() => setOtherFees((current) => current.filter((item) => item.id !== fee.id))}>Remove</button>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3 text-slate-900">
                <p className="text-sm font-medium text-slate-900">Crew on this job ({crew.length})</p>
                <div className="mt-2 flex gap-2">
                  <select className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={pickedEmployee} onChange={(event) => setPickedEmployee(event.target.value)}>
                    <option value="">Add an employee</option>
                    {employees.filter((person) => person.active !== false).map((person) => (
                      <option key={person.id} value={person.id}>{person.name} · ${Number(person.rate || 0).toFixed(2)}/hr</option>
                    ))}
                  </select>
                  <button type="button" onClick={addCrew} className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">Add</button>
                </div>
                {crew.map((row) => (
                  <div key={row.id} className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-slate-900">
                    <p className="text-sm font-medium text-slate-900">{row.name} · ${Number(row.rate || 0).toFixed(2)}/hr saved on this job</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm text-slate-900">Work date<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={row.workDate} onChange={(event) => updateCrew(row.id, { workDate: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Hours<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={row.hours} onChange={(event) => updateCrew(row.id, { hours: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Start<input type="time" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={row.startTime} onChange={(event) => updateCrew(row.id, { startTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">End<input type="time" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={row.endTime} onChange={(event) => updateCrew(row.id, { endTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900 sm:col-span-2">Extra pay for this job<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" placeholder="100" value={row.bonus} onChange={(event) => updateCrew(row.id, { bonus: event.target.value })} /></label>
                    </div>
                    <p className="text-sm text-slate-900">Paid this job: ${rowPay(row).toFixed(2)}</p>
                    <button type="button" onClick={() => allowCrewChange() && setCrew((current) => current.filter((item) => item.id !== row.id))} className="text-sm text-slate-700">Remove from job</button>
                  </div>
                ))}
              </div>
              <label className="block text-sm">Cost notes<textarea className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2" value={costs.notes} onChange={(event) => setCosts({ ...costs, notes: event.target.value })} /></label>
              <div className="space-y-1 text-sm">
                <p>Job cost: ${jobMath.jobCost.toFixed(2)}</p>
                {(costs.driveHours || costs.driveMinutes) && <p>Drive time: {costs.driveHours || "0"} hrs {costs.driveMinutes || "0"} min, not added to job cost</p>}
                <p>You charge: ${totals.total.toFixed(2)}</p>
                <p>Left over: ${jobMath.leftOver.toFixed(2)}</p>
                <p>Set aside ({setAsidePercent}%): ${jobMath.setAside.toFixed(2)}</p>
                <p className="font-semibold">Yours after set-aside: ${jobMath.yours.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {!locked && <button type="button" onClick={saveDocument} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Save document</button>}
              {isProposal && !locked && (
                <button type="button" onClick={createInvoiceFromProposal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Create invoice</button>
              )}
              {!locked && <button type="button" onClick={clearForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Clear form</button>}
            </div>
            {saveMessage && <p className="text-sm text-slate-600">{saveMessage}</p>}
          </fieldset>
        </form>
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Print / Save PDF</button>
            {!locked && !isProposal && status !== "paid" && <button type="button" onClick={copyPayLink} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">{paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}</button>}
          </div>
          <div id="preview" className={previewClass}>
            {logo && <img src={logo} alt="Business logo" className="mb-3 h-14 w-auto" />}
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm uppercase tracking-wide ${labelClass}`}>{isProposal ? "Proposal" : "Invoice"}</p>
                <h2 className="mt-1 text-2xl font-semibold">{invoiceNumber || (isProposal ? "PROP-0000" : "INV-0000")}</h2>
                <div className={`mt-4 text-sm ${mutedClass}`}><p className="font-medium">{businessName}</p><p>{ownerName}</p><p>{businessEmail}</p><p>{businessPhone}</p></div>
              </div>
              <div className={`text-right text-sm ${mutedClass}`}>
                <div>Date: {invoiceDate || "-"}</div>
                <div>{isProposal ? "Valid until" : "Due"}: {dueDate || "-"}</div>
                {(jobStart || jobEnd) && <div>Time: {jobStart || "-"} to {jobEnd || "-"}</div>}
              </div>
            </div>
            <div className="mt-8">
              <p className={`text-sm ${labelClass}`}>{isProposal ? "Prepared for" : "Bill to"}</p>
              <p className="font-medium">{clientName || "Client name"}</p>
              {clientCompany && <p className={`text-sm ${mutedClass}`}>{clientCompany}</p>}
              {clientEmail && <p className={`text-sm ${mutedClass}`}>{clientEmail}</p>}
              {clientPhone && <p className={`text-sm ${mutedClass}`}>{clientPhone}</p>}
              {clientAddress && <p className={`text-sm ${mutedClass}`}>{clientAddress}</p>}
            </div>
            <div className="mt-8 border-t border-slate-500 pt-4">
              {items.map((item, index) => {
                const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
                return <div key={index} className="flex justify-between py-2 text-sm"><span>{item.description || "Item"}</span><span>${amount.toFixed(2)}</span></div>;
              })}
            </div>
            <div className="mt-6 space-y-1 border-t border-slate-500 pt-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>${totals.tax.toFixed(2)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
            </div>
            <p className={`mt-8 text-sm ${mutedClass}`}>{notes}</p>
            {!isProposal && paymentLink && <p className={`mt-4 text-sm ${mutedClass}`}>Pay here: {paymentLink}</p>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}