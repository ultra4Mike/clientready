"use client";

import { useEffect, useMemo, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { getTrialState } from "@/lib/trial";
import { saveCrewJobs } from "@/lib/crew";
import { balanceDue, paidTotal, paymentFields, paymentMethods, readPayments, type Payment } from "@/lib/payments";
import { JobPhotosEditor, JobPhotoStrip } from "@/components/JobPhotos";
import { isQuotaError, readPhotos, type JobPhoto } from "@/lib/photos";
import LineSplit from "@/components/LineSplit";
import { normalizeCategory, type LineCategory } from "@/lib/line-split";
import { appendChangeOrderNote, changeOrderData, changeOrdersFor, mergeChangeOrderNotes, readChangeOrderNotes, readChangeOrderOf, type ChangeOrderNote, type ChangeOrderOf } from "@/lib/change-orders";
import ChangeOrderNotes from "@/components/ChangeOrderNotes";
import { ApprovalBadge, ApprovalShare } from "@/components/Approval";
import ScheduleEditor from "@/components/ScheduleEditor";
import { entryHours, fmtHours, hoursByWorker, ownerEditClock, refreshOwnerClock, type ClockEntry } from "@/lib/clock";
import { confirmRemoval, crewForWorkers, crewIds, workLogged, clockHoursFor, dedupeWorkerIds, readSchedule, readWorkers, saveAssignment, saveSchedule, syncScheduleCrewJobs, STATUS_LABEL, type Schedule, type Worker } from "@/lib/schedule";
import { readApproval, refreshApproval, type Approval } from "@/lib/approval";
import { generateNextNow, readRecurring, readRecurringFrom, scheduleFromForm, type Frequency, type RecurringFrom } from "@/lib/recurring";
import PayQr from "@/components/PayQr";
import { payUrlFor } from "@/lib/pay-link";
import SignaturePad, { SignatureBlock } from "@/components/SignaturePad";
import { readSignature, type Signature } from "@/lib/signature";
import { amountOf, documentTotals, discountLabel, normalizeDiscountType, type DiscountType } from "@/lib/discount";

type LineItem = { description: string; qty: string; rate: string; category?: LineCategory };
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
  /** Hours were filled from the worker's clock entries (true) or typed by the owner (false/absent). */
  hoursFromClock?: boolean;
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
function toLocalInput(iso: string) {
  const date = new Date(iso);
  return `${ymd(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Fills crew pay hours from clock entries. A row whose hours are empty or came from the clock
 * gets the clocked total; hours the owner typed are kept (the clocked total is shown beside them).
 * With several rows for one person, the clock fills only their first row.
 */
function feedClockHours(rows: CrewRow[], entries: ClockEntry[], docId: string) {
  const totals = hoursByWorker(entries.filter((entry) => entry.ended_at), docId);
  const filled = new Set<string>();
  return rows.map((row) => {
    const clocked = totals[row.employeeId] || 0;
    if (!clocked || filled.has(row.employeeId)) return row;
    filled.add(row.employeeId);
    if (row.hours && !row.hoursFromClock) return row;
    const hours = clocked.toFixed(2);
    return row.hours === hours && row.hoursFromClock ? row : { ...row, hours, hoursFromClock: true };
  });
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
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [proposalSignature, setProposalSignature] = useState<Signature | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [docPayLink, setDocPayLink] = useState("");
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [changeOrderOf, setChangeOrderOf] = useState<ChangeOrderOf | null>(null);
  const [changeOrderNotes, setChangeOrderNotes] = useState<ChangeOrderNote[]>([]);
  const [recFreq, setRecFreq] = useState<Frequency | "off">("off");
  const [recInterval, setRecInterval] = useState("30");
  const [recNext, setRecNext] = useState("");
  const [recLoadedNext, setRecLoadedNext] = useState("");
  const [recurringFrom, setRecurringFrom] = useState<RecurringFrom | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [scheduleKey, setScheduleKey] = useState(0);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [clockFix, setClockFix] = useState<{ id: string; start: string; end: string } | null>(null);
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
      // The document to open comes from the URL (?id=..., survives reloads and is per-tab) or,
      // for older links, the one-shot "open-document" handoff key.
      const urlId = new URLSearchParams(window.location.search).get("id");
      const openId = urlId || window.localStorage.getItem("clientready-open-document");
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
      const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
      const doc = docs.find((item) => item.id === openId && (item.type === "invoice" || item.type === "proposal"));
      window.localStorage.removeItem("clientready-open-document");
      window.localStorage.removeItem("clientready-new-type");
      if (!doc) {
        window.history.replaceState(null, "", "/invoice");
        setInvoiceNumber(nextNumber("invoice"));
        setInvoiceDate(ymd(new Date()));
        setDueDate(plusDays(14));
        setSaveMessage("That document was not found on this device, so a new invoice was started.");
        return;
      }
      window.history.replaceState(null, "", `/invoice?id=${encodeURIComponent(doc.id)}`);
      const data = (doc.data || {}) as {
        clientName?: string; clientCompany?: string; clientEmail?: string; clientPhone?: string; clientAddress?: string;
        invoiceNumber?: string; invoiceDate?: string; dueDate?: string; jobStart?: string; jobEnd?: string; notes?: string;
        taxPercent?: string; discountType?: string; discountValue?: string; signature?: unknown; proposalSignature?: unknown; payLink?: string; photos?: unknown; changeOrderOf?: unknown; changeOrderNotes?: unknown; recurring?: unknown; recurringFrom?: unknown; approval?: unknown; items?: LineItem[]; status?: string; style?: string; jobTime?: string; jobCosts?: JobCosts; crew?: CrewRow[];
      };
      const kind: DocKind = doc.type === "proposal" ? "proposal" : "invoice";
      const loadedItems = Array.isArray(data.items) && data.items.length ? data.items.map((item) => ({ ...item, category: normalizeCategory(item.category) })) : [{ ...emptyItem }];
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
      setDiscountType(normalizeDiscountType(data.discountType));
      setDiscountValue(data.discountValue || "");
      setPayments(readPayments(data));
      setSignature(readSignature(data.signature));
      setProposalSignature(readSignature(data.proposalSignature));
      setPadKey((key) => key + 1);
      setDocPayLink(data.payLink || "");
      setPhotos(readPhotos(data.photos));
      setChangeOrderOf(kind === "invoice" ? readChangeOrderOf(data.changeOrderOf) : null);
      setChangeOrderNotes(readChangeOrderNotes(data.changeOrderNotes));
      const schedule = kind === "invoice" ? readRecurring(data.recurring) : null;
      setRecFreq(schedule && schedule.active ? schedule.frequency : "off");
      setRecInterval(String(schedule?.intervalDays || 30));
      setRecNext(schedule?.nextRunDate || "");
      setRecLoadedNext(schedule?.nextRunDate || "");
      setRecurringFrom(kind === "invoice" ? readRecurringFrom(data.recurringFrom) : null);
      setApproval(readApproval(data.approval));
      setSchedule(readSchedule(doc.data as Record<string, unknown>));
      setWorkers(readWorkers());
      setScheduleKey((key) => key + 1);
      // The cloud is the source of truth for approval (the customer approves there).
      refreshApproval(doc.id).then((latest) => { if (latest !== undefined) setApproval(latest); });
      setItems(loadedItems);
      setClientSearch(data.clientName || "");
      setStatus(data.status || "draft");
      setStyle(data.style || "clean");
      setJobTime(data.jobTime || "");
      setCosts({ ...emptyCosts, ...(data.jobCosts || {}), otherFees: loadedFees });
      setOtherFees(loadedFees);
      setCrew(loadedCrew.map((row) => ({ ...row, bonus: row.bonus || "" })));
      // Clock entries from the crew app feed each worker's hours (see feedClockHours).
      refreshOwnerClock().then((entries) => {
        setClockEntries(entries);
        setCrew((current) => feedClockHours(current, entries, doc.id));
      });
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
  
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + amountOf(item.qty) * amountOf(item.rate), 0);
    const base = documentTotals(subtotal, taxPercent, discountType, discountValue);
    const paid = paidTotal(payments);
    return { ...base, paid, balance: balanceDue(base.total, paid, status) };
  }, [items, taxPercent, discountType, discountValue, payments, status]);

  function addPayment() {
    setPayments((current) => [...current, { id: Date.now().toString(), amount: current.length ? "" : (totals.balance || totals.total).toFixed(2), method: "Cash", date: ymd(new Date()), ref: "" }]);
  }
  function updatePayment(id: string, patch: Partial<Payment>) {
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment));
  }

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
    if (crew.some((row) => row.employeeId === person.id) || !dedupeWorkerIds([...crewIds(crew), person.id]).includes(person.id)) {
      return setSaveMessage(`${person.name} is already on this job.`);
    }
    if (!allowCrewChange()) return;
    const nextCrew = [...crew, {
      id: `crew-${person.id}`, employeeId: person.id, name: person.name, rate: person.rate,
      hours: "", startTime: jobStart, endTime: jobEnd, workDate: invoiceDate, note: "", bonus: "", paidToWorker: false, paidDate: "",
    }];
    setCrew(nextCrew);
    setCosts((current) => ({ ...current, labor: nextCrew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) }));
    setPickedEmployee("");
    setSaveMessage(`${person.name} added. Pick the next person and click Add again.`);
    void shareAssignment(nextCrew);
  }

  /** Crew/pay section changed who is on the job: save it as the job's assignment (schedule.workerIds). */
  async function shareAssignment(nextCrew: CrewRow[], confirmed: string[] = []) {
    if (!docId) return;
    try {
      const saved = await saveAssignment(docId, dedupeWorkerIds(crewIds(nextCrew)), confirmed);
      if (saved?.data?.schedule) {
        setSchedule(readSchedule(saved.data));
        setScheduleKey((key) => key + 1);
      }
    } catch {
      setSaveMessage("Could not save the crew change.");
    }
  }

  async function saveClockFix() {
    if (!clockFix) return;
    const start = new Date(clockFix.start);
    const end = new Date(clockFix.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return setSaveMessage("End time must be after the start time.");
    const error = await ownerEditClock(clockFix.id, start.toISOString(), end.toISOString());
    if (error) return setSaveMessage(`Could not fix the time: ${error}`);
    const entries = await refreshOwnerClock();
    setClockEntries(entries);
    setCrew((current) => feedClockHours(current, entries, docId));
    setClockFix(null);
    setSaveMessage("Clock time fixed. Save the document to update pay.");
  }

  function removeCrewRow(id: string) {
    const row = crew.find((item) => item.id === id);
    if (!row) return;
    // Hours typed in this form count too, not just what is saved.
    if (!confirmRemoval(workLogged([row], [row.employeeId], crew.some((item) => item.id !== id && item.employeeId === row.employeeId) ? {} : clockHoursFor(docId)))) return;
    if (!allowCrewChange()) return;
    const nextCrew = crew.filter((item) => item.id !== id);
    setCrew(nextCrew);
    void shareAssignment(nextCrew, [row.employeeId]);
  }

  function updateCrew(id: string, patch: Partial<CrewRow>) {
    if (!allowCrewChange()) return;
    // Typing hours makes them the owner's: clock entries won't overwrite them after this.
    if ("hours" in patch) patch = { ...patch, hoursFromClock: false };
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
    window.history.replaceState(null, "", "/invoice");
    setDocId(""); setClientSearch(""); setClientName(""); setClientCompany(""); setClientEmail(""); setClientPhone(""); setClientAddress("");
    setInvoiceNumber(nextNumber(docKind)); setInvoiceDate(ymd(new Date())); setDueDate(plusDays(14)); setJobStart(""); setJobEnd("");
    setNotes(isProposal ? "This proposal is valid for 14 days." : "Payment is due within 14 days.");
    setTaxPercent("0"); setDiscountType("percent"); setDiscountValue(""); setPayments([]); setSignature(null); setProposalSignature(null); setPadKey((key) => key + 1); setDocPayLink(""); setPhotos([]); setChangeOrderOf(null); setChangeOrderNotes([]); setRecFreq("off"); setRecNext(""); setRecLoadedNext(""); setRecurringFrom(null); setApproval(null); setSchedule(null); setItems([{ ...emptyItem }]); setSaveMessage(""); setStatus("draft");
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
    // Change-order notes are append-only: keep whatever is stored, plus what this form loaded.
    const stored = (docs as SavedDocument[]).find((item) => item.id === localId);
    const keptNotes = mergeChangeOrderNotes(readChangeOrderNotes(stored?.data?.changeOrderNotes), changeOrderNotes);
    const recurring = isProposal ? null : scheduleFromForm(readRecurring(stored?.data?.recurring), { frequency: recFreq, intervalDays: recInterval, nextRunDate: recNext, loadedNextRunDate: recLoadedNext, today: ymd(new Date()) });
    const nextDoc = {
      id: localId,
      type: docKind,
      title: invoiceNumber || (isProposal ? "Proposal" : "Invoice"),
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: { clientName, clientCompany, clientEmail, clientPhone, clientAddress, invoiceNumber, invoiceDate, dueDate, jobStart, jobEnd, notes, taxPercent, discountType, discountValue, discountAmount: totals.discount.toFixed(2), ...paymentFields(payments), signature, proposalSignature, payLink: docPayLink, photos, ...(changeOrderOf && !isProposal ? { changeOrderOf } : {}), ...(keptNotes.length ? { changeOrderNotes: keptNotes } : {}), ...(recurring ? { recurring } : {}), ...(recurringFrom && !isProposal ? { recurringFrom } : {}), ...(stored?.data?.approval ? { approval: stored.data.approval } : {}), ...(stored?.data?.schedule ? { schedule: stored.data.schedule } : {}), items, status, style, jobTime, jobCosts: { ...costs, labor, otherFees }, crew },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    try {
      window.localStorage.setItem("clientready-documents", JSON.stringify([...docs.filter((item: { id: string }) => item.id !== localId && item.id !== cloudId), nextDoc]));
    } catch (error) {
      setDocId(cloudId);
      setSaveMessage(isQuotaError(error)
        ? `This browser's storage is full, so the document was not saved on this device${cloudId !== localId ? " (it was saved to your account)" : ""}. Remove some photos or delete old documents, then save again.`
        : "Could not save on this device.");
      return;
    }
    setDocId(cloudId);
    window.history.replaceState(null, "", `/invoice?id=${encodeURIComponent(cloudId)}`);
    await saveCrewJobs(cloudId, {
      invoiceNumber,
      clientName,
      clientPhone,
      clientAddress,
      status,
      startTime: jobStart,
      endTime: jobEnd,
    }, crew);
    await syncScheduleCrewJobs(nextDoc);
    setWorkers(readWorkers());
    setSaveMessage(isProposal ? "Proposal saved" : "Invoice saved");
  }

  async function saveJobSchedule(next: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) {
    try {
      const saved = await saveSchedule(docId, next, options?.confirmed);
      const savedSchedule = saved ? readSchedule(saved.data) : null;
      setSchedule(savedSchedule);
      // Same people in the crew/pay section: add empty rows for new people, drop removed ones,
      // leave everyone else's hours and pay as typed.
      if (savedSchedule) setCrew((current) => crewForWorkers(current, savedSchedule.workerIds, savedSchedule) as CrewRow[]);
      // Crew add/remove keeps the editor as is (other unsaved edits stay); a full save reloads it.
      if (!options?.keepOpen) setScheduleKey((key) => key + 1);
      setSaveMessage(next ? "Schedule saved" : "Job unscheduled");
    } catch {
      setSaveMessage("Could not save the schedule.");
    }
  }

  async function generateRecurringNow() {
    if (locked) return setSaveMessage("Trial ended. Subscribe to save. $7.99/mo or $19.99 for 3 months.");
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
    const stored = readRecurring(docs.find((doc) => doc.id === docId)?.data?.recurring);
    if (!stored || !stored.active) return setSaveMessage("Turn on a schedule and save the invoice first.");
    const draftId = await generateNextNow(docId);
    if (!draftId) return setSaveMessage("Another tab is generating invoices right now. Try again in a moment.");
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/invoice?id=${encodeURIComponent(draftId)}`;
  }

  /** New draft invoice copied from the saved version of this invoice. The original is not changed. */
  async function createChangeOrder() {
    if (locked) {
      setSaveMessage("Trial ended. Subscribe to save. $7.99/mo or $19.99 for 3 months.");
      return;
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
    const original = docs.find((doc) => doc.id === docId && doc.type === "invoice");
    if (!original) return setSaveMessage("Save this invoice first, then create a change order.");
    const originalNumber = String(original.data?.invoiceNumber || original.title);
    const count = changeOrdersFor(docs, original.id).length + 1;
    const number = nextNumber("invoice");
    const nextDoc = {
      id: Date.now().toString(),
      type: "invoice" as const,
      title: `Change Order #${count} to ${originalNumber}`,
      clientName: original.clientName,
      createdAt: new Date().toLocaleDateString(),
      data: changeOrderData(original, number, ymd(new Date()), plusDays(14)),
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    // Append-only note on the original: re-read what is stored, add the note, touch nothing else.
    const latestRaw = window.localStorage.getItem("clientready-documents");
    const latest = latestRaw ? (JSON.parse(latestRaw) as SavedDocument[]) : docs;
    const noted = appendChangeOrderNote(latest, original.id, { id: cloudId, number, createdAt: new Date().toISOString() });
    try {
      window.localStorage.setItem("clientready-documents", JSON.stringify([...(noted ? noted.docs : latest), nextDoc]));
    } catch (error) {
      setSaveMessage(isQuotaError(error) ? "This browser's storage is full, so the change order could not be created on this device. Remove some photos or delete old documents, then try again." : "Could not create the change order on this device.");
      return;
    }
    if (noted) await saveCloudDocument(noted.original);
    // Full page load on purpose: the editor reads the document once on mount, so a client-side
    // push to the same route would keep showing the original invoice.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/invoice?id=${encodeURIComponent(cloudId)}`;
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
        jobStart, jobEnd, notes: "Payment is due within 14 days.", taxPercent, discountType, discountValue, discountAmount: totals.discount.toFixed(2), ...paymentFields(payments), signature: null, proposalSignature: signature, payLink: docPayLink, photos, items,
        status: "draft", style, jobTime, jobCosts: { ...costs, labor, otherFees }, crew,
      },
    };
    const cloudId = await saveCloudDocument(nextDoc);
    nextDoc.id = cloudId;
    try {
      window.localStorage.setItem("clientready-documents", JSON.stringify([...docs, nextDoc]));
    } catch (error) {
      setSaveMessage(isQuotaError(error) ? "This browser's storage is full, so the invoice could not be created on this device. Remove some photos or delete old documents, then try again." : "Could not create the invoice on this device.");
      return;
    }
    window.location.href = `/invoice?id=${encodeURIComponent(cloudId)}`;
  }

  async function copyPayLink() {
    if (!paymentLink.trim()) return (window.location.href = "/profile");
    try { await navigator.clipboard.writeText(paymentLink); setSaveMessage("Pay link copied"); } catch { setSaveMessage(paymentLink); }
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  const jobMath = useMemo(() => {
    const otherTotal = otherFees.reduce((sum, fee) => sum + money(fee.amount), 0);
    const jobCost = money(costs.parts) + money(costs.gas) + money(costs.labor) + money(costs.tools) + money(costs.lunch) + otherTotal;
    const leftOver = totals.total - jobCost;
    const setAside = leftOver > 0 ? leftOver * ((Number(setAsidePercent) || 0) / 100) : 0;
    return { jobCost, leftOver, setAside, yours: leftOver - setAside };
  }, [costs, otherFees, totals.total, setAsidePercent]);

  const payUrl = payUrlFor(docPayLink, paymentLink);

  const previewClass = style === "bold" ? "rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm" : "rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm";
  const mutedClass = style === "bold" ? "text-slate-300" : "text-slate-600";
  const labelClass = style === "bold" ? "text-slate-400" : "text-slate-500";

  return (
    <AppShell title={isProposal ? "New proposal" : "New invoice"}>
      <section className="print-reset mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-2 lg:gap-8">
        <form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
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
              <button type="button" onClick={() => chooseKind("invoice")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${!isProposal ? "bg-teal-500 text-slate-950 shadow-sm" : "border border-slate-300 hover:border-teal-500"}`}>Invoice</button>
              <button type="button" onClick={() => chooseKind("proposal")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${isProposal ? "bg-teal-500 text-slate-950 shadow-sm" : "border border-slate-300 hover:border-teal-500"}`}>Proposal</button>
            </div>
            <h1 className="text-xl font-bold tracking-tight">{isProposal ? "Proposal details" : "Invoice details"}</h1>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Client</h2>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Search clients by name" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} />
            {filteredClients.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {filteredClients.map((client) => (
                  <button key={client.id} type="button" onClick={() => chooseClient(client)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left transition last:border-0 hover:bg-teal-500/10">
                    <span className="block font-medium">{client.name}</span>
                    <span className="block text-sm text-slate-500">{client.company || client.email}</span>
                  </button>
                ))}
              </div>
            )}
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client name" value={clientName} onChange={(event) => setClientName(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client company" value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client phone" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client address" value={clientAddress} onChange={(event) => setClientAddress(event.target.value)} />
            <button type="button" onClick={saveClientFromForm} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Save as client</button>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Details & schedule</h2>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder={isProposal ? "Proposal number" : "Invoice number"} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              {isProposal ? <option value="accepted">Accepted</option> : <><option value="paid">Paid</option><option value="overdue">Overdue</option></>}
            </select>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="clean">Clean professional</option><option value="bold">Bold modern</option>
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">{isProposal ? "Proposal date" : "Invoice date"}<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
              <label className="text-sm text-slate-600">{isProposal ? "Valid until" : "Due date"}<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label className="text-sm text-slate-600">Job start<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={jobStart} onChange={(event) => setJobStart(event.target.value)} /></label>
              <label className="text-sm text-slate-600">Job end<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={jobEnd} onChange={(event) => setJobEnd(event.target.value)} /></label>
            </div>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Line items & pricing</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="font-medium">Line items</h2><button type="button" className="text-sm" onClick={() => setItems((current) => [...current, { ...emptyItem }])}>Add item</button></div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-4">
                  <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Description" value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Qty" value={item.qty} onChange={(event) => updateItem(index, "qty", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Rate" value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} />
                  <select aria-label="Item type" data-testid="item-category" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={item.category || ""} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: normalizeCategory(event.target.value) } : row))}>
                    <option value="">Unmarked</option>
                    <option value="labor">Labor</option>
                    <option value="materials">Materials</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Discount (taken off before tax)</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDiscountType("percent")} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${discountType === "percent" ? "bg-teal-500 font-semibold text-slate-950" : "border border-slate-300 hover:border-teal-500"}`}>%</button>
                <button type="button" onClick={() => setDiscountType("amount")} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${discountType === "amount" ? "bg-teal-500 font-semibold text-slate-950" : "border border-slate-300 hover:border-teal-500"}`}>$</button>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" inputMode="decimal" placeholder={discountType === "percent" ? "Discount percent, e.g. 10" : "Discount amount, e.g. 50"} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
              </div>
            </div>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Tax percent" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} />
            <div className="space-y-2 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{isProposal ? "Deposit received" : "Payments received"}</h2>
                <button type="button" className="text-sm" onClick={addPayment}>{payments.length ? "Add another payment" : isProposal ? "Add deposit" : "Add payment"}</button>
              </div>
              {payments.map((payment) => (
                <div key={payment.id} className="grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2">
                  <label className="text-sm text-slate-600">Amount paid<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" inputMode="decimal" placeholder="300" value={payment.amount} onChange={(event) => updatePayment(payment.id, { amount: event.target.value })} /></label>
                  <label className="text-sm text-slate-600">Method<select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={payment.method} onChange={(event) => updatePayment(payment.id, { method: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
                  <label className="text-sm text-slate-600">Date paid<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={payment.date} onChange={(event) => updatePayment(payment.id, { date: event.target.value })} /></label>
                  <label className="text-sm text-slate-600">Reference / note<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Check number, confirmation, last 4" value={payment.ref} onChange={(event) => updatePayment(payment.id, { ref: event.target.value })} /></label>
                  <button type="button" className="text-left text-sm text-slate-600" onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))}>Remove payment</button>
                </div>
              ))}
              <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                <p className="text-sm text-slate-600">Total ${totals.total.toFixed(2)} · Paid ${totals.paid.toFixed(2)}</p>
                <p className="text-right"><span className="block text-sm font-medium text-slate-600">Still owed</span><span data-testid="still-owed" className="text-2xl font-bold">${totals.balance.toFixed(2)}</span></p>
              </div>
            </div>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Payment, photos & notes</h2>
            {!isProposal && (
              <label className="block text-sm font-medium text-slate-600">
                Pay link for this invoice (optional)
                <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="https://… (uses your profile pay link if blank)" value={docPayLink} onChange={(event) => setDocPayLink(event.target.value)} />
                <span className="mt-1 block text-xs text-slate-500" data-testid="pay-qr-note">
                  {payUrl ? `"Scan to pay" QR will link to ${payUrl}` : docPayLink.trim() ? "Not a web link (must start with http:// or https://), so no QR code is shown." : "No web pay link yet, so no QR code is shown. Add one here or in Profile."}
                </span>
              </label>
            )}
            <JobPhotosEditor photos={photos} onChange={setPhotos} />
            <SignaturePad key={padKey} value={signature} onChange={setSignature} defaultName={clientName} />
            <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="owner-costs space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 sm:p-5">
              <h2 className="font-medium">Your costs only</h2>
              <p className="text-sm text-slate-600">Wages fill from hours times the saved rate, plus any extra pay.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Parts<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={costs.parts} onChange={(event) => setCosts({ ...costs, parts: event.target.value })} /></label>
                <label className="text-sm">Gas / diesel<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Receipt amount" value={costs.gas} onChange={(event) => setCosts({ ...costs, gas: event.target.value })} /></label>
                <label className="text-sm">
                  Drive time
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Hours" value={costs.driveHours} onChange={(event) => setCosts({ ...costs, driveHours: event.target.value })} />
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Minutes" value={costs.driveMinutes} onChange={(event) => setCosts({ ...costs, driveMinutes: event.target.value })} />
                  </div>
                </label>
                <label className="text-sm">Labor / wages<input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={costs.labor} readOnly={crew.length > 0} onChange={(event) => setCosts({ ...costs, labor: event.target.value })} /></label>
                <label className="text-sm">Job supplies<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Bags, blades, gloves" value={costs.tools} onChange={(event) => setCosts({ ...costs, tools: event.target.value })} /></label>
                <label className="text-sm">Lunch / meals cost<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={costs.lunch} onChange={(event) => setCosts({ ...costs, lunch: event.target.value })} /></label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">Other fees</p>
                  <button type="button" className="rounded-lg bg-teal-400 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-300" onClick={() => setOtherFees((current) => [...current, { id: Date.now().toString(), name: "", amount: "" }])}>Add fee</button>
                </div>
                {otherFees.map((fee) => (
                  <div key={fee.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                    <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Dump fee, permit, parking" value={fee.name} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, name: event.target.value } : item))} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Cost" value={fee.amount} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, amount: event.target.value } : item))} />
                    <button type="button" className="text-sm" onClick={() => setOtherFees((current) => current.filter((item) => item.id !== fee.id))}>Remove</button>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3 text-slate-900">
                <p className="text-sm font-medium text-slate-900">Crew on this job ({crew.length})</p>
                <div className="mt-2 flex gap-2">
                  <select className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={pickedEmployee} onChange={(event) => setPickedEmployee(event.target.value)}>
                    <option value="">Add an employee</option>
                    {employees.filter((person) => person.active !== false).map((person) => (
                      <option key={person.id} value={person.id}>{person.name} · ${Number(person.rate || 0).toFixed(2)}/hr</option>
                    ))}
                  </select>
                  <button type="button" onClick={addCrew} className="rounded-lg bg-teal-400 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-300 disabled:opacity-50">Add</button>
                </div>
                {crew.map((row) => (
                  <div key={row.id} className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-slate-900">
                    <p className="text-sm font-medium text-slate-900">{row.name} · ${Number(row.rate || 0).toFixed(2)}/hr saved on this job</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm text-slate-900">Work date<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.workDate} onChange={(event) => updateCrew(row.id, { workDate: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Hours<input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.hours} onChange={(event) => updateCrew(row.id, { hours: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Start<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.startTime} onChange={(event) => updateCrew(row.id, { startTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">End<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.endTime} onChange={(event) => updateCrew(row.id, { endTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900 sm:col-span-2">Extra pay for this job<input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="100" value={row.bonus} onChange={(event) => updateCrew(row.id, { bonus: event.target.value })} /></label>
                    </div>
                    {(() => {
                      const mine = clockEntries.filter((entry) => entry.doc_id === docId && entry.employee_id === row.employeeId);
                      if (!mine.length) return null;
                      const clocked = mine.reduce((sum, entry) => sum + entryHours(entry), 0);
                      return (
                        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700" data-testid={`clock-${row.employeeId}`}>
                          <p className="font-medium">Clocked {fmtHours(clocked)} ({mine.length} entr{mine.length === 1 ? "y" : "ies"}) · {row.hoursFromClock ? "hours above come from the clock" : "your typed hours are kept"}</p>
                          {mine.map((entry) => (
                            <div key={entry.id} className="mt-1 flex flex-wrap items-center gap-2" data-testid="owner-clock-entry">
                              <span>{new Date(entry.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {entry.ended_at ? new Date(entry.ended_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : <b className="text-amber-700">still clocked in</b>}</span>
                              {entry.edited_reason && <span className="italic">({entry.edited_reason})</span>}
                              <button type="button" className="underline" onClick={() => setClockFix({ id: entry.id, start: toLocalInput(entry.started_at), end: toLocalInput(entry.ended_at || new Date().toISOString()) })}>Fix</button>
                            </div>
                          ))}
                          {clockFix && mine.some((entry) => entry.id === clockFix.id) && (
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <label>Start<input type="datetime-local" className="ml-1 rounded-md border border-slate-300 px-1.5 py-0.5" value={clockFix.start} onChange={(event) => setClockFix({ ...clockFix, start: event.target.value })} /></label>
                              <label>End<input aria-label="Clock end" type="datetime-local" className="ml-1 rounded-md border border-slate-300 px-1.5 py-0.5" value={clockFix.end} onChange={(event) => setClockFix({ ...clockFix, end: event.target.value })} /></label>
                              <button type="button" onClick={saveClockFix} className="rounded-md bg-teal-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-teal-400">Save time</button>
                              <button type="button" onClick={() => setClockFix(null)} className="underline">Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-sm text-slate-900">Paid this job: ${rowPay(row).toFixed(2)}</p>
                    <button type="button" onClick={() => removeCrewRow(row.id)} className="text-sm text-slate-700">Remove from job</button>
                  </div>
                ))}
              </div>
              <label className="block text-sm">Cost notes<textarea className="mt-1.5 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={costs.notes} onChange={(event) => setCosts({ ...costs, notes: event.target.value })} /></label>
              <div className="space-y-1 text-sm">
                <p>Job cost: ${jobMath.jobCost.toFixed(2)}</p>
                {(costs.driveHours || costs.driveMinutes) && <p>Drive time: {costs.driveHours || "0"} hrs {costs.driveMinutes || "0"} min, not added to job cost</p>}
                <p>You charge: ${totals.total.toFixed(2)}</p>
                <p>Left over: ${jobMath.leftOver.toFixed(2)}</p>
                <p>Set aside ({setAsidePercent}%): ${jobMath.setAside.toFixed(2)}</p>
                <p className="font-semibold">Yours after set-aside: ${jobMath.yours.toFixed(2)}</p>
                <CrewSpend docId={docId} />
              </div>
            </div>
            <div className="print-hide space-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:p-5" data-testid="schedule-section">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Schedule</p>
                {schedule && <span className="text-xs" data-testid="schedule-summary">{schedule.date}{schedule.startTime ? ` ${schedule.startTime}` : ""}{schedule.endTime ? `–${schedule.endTime}` : ""} · {STATUS_LABEL[schedule.status]}</span>}
              </div>
              {docId && !locked
                ? <ScheduleEditor key={scheduleKey} value={schedule} workers={workers} onSave={saveJobSchedule} confirmRemove={(ids) => confirmRemoval(workLogged(crew, ids, clockHoursFor(docId)))} />
                : <p className="text-xs text-slate-500">Save the document first, then schedule the job here or on the Calendar.</p>}
            </div>
            {docId && !locked && <ApprovalShare docId={docId} approval={approval} onChange={setApproval} />}
            {!isProposal && docId && (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:p-5" data-testid="recurring-section">
                <p className="font-semibold">Recurring</p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">Repeat
                    <select aria-label="Repeat" value={recFreq} onChange={(event) => { const value = event.target.value as Frequency | "off"; setRecFreq(value); if (value !== "off" && !recNext) setRecNext(ymd(new Date())); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30">
                      <option value="off">Off</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="days">Every X days</option>
                    </select>
                  </label>
                  {recFreq === "days" && (
                    <label className="flex flex-col gap-1">Days
                      <input aria-label="Interval days" type="number" min="1" value={recInterval} onChange={(event) => setRecInterval(event.target.value)} className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
                    </label>
                  )}
                  {recFreq !== "off" && (
                    <label className="flex flex-col gap-1">Next run
                      <input aria-label="Next run date" type="date" value={recNext} onChange={(event) => setRecNext(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" />
                    </label>
                  )}
                  {recFreq !== "off" && !locked && <button type="button" onClick={generateRecurringNow} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Generate next invoice now</button>}
                </div>
                <p className="text-xs text-slate-500">Drafts are made when the app opens on or after the next run date. They are never sent or marked paid. Save the document to keep schedule changes.</p>
              </div>
            )}
            <div className="print-hide sticky bottom-0 z-10 -mx-4 grid grid-cols-2 gap-2 border-t border-slate-200 bg-[var(--cr-card)] px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-6 sm:flex sm:flex-wrap sm:gap-3 sm:px-6">
              {!locked && <button type="button" onClick={saveDocument} className="col-span-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 disabled:opacity-50">Save document</button>}
              {isProposal && !locked && (
                <button type="button" onClick={createInvoiceFromProposal} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Create invoice</button>
              )}
              {!isProposal && !locked && docId && (
                <button type="button" onClick={createChangeOrder} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Create change order</button>
              )}
              {!locked && <button type="button" onClick={clearForm} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Clear form</button>}
            </div>
            {saveMessage && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-slate-600">{saveMessage}</p>}
          </fieldset>
        </form>
        <div>
          <div className="print-hide mb-4 flex flex-wrap gap-2 sm:gap-3">
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-teal-400 disabled:opacity-50">Print / Save PDF</button>
            {!locked && !isProposal && status !== "paid" && <button type="button" onClick={copyPayLink} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">{paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}</button>}
          </div>
          <div id="preview" className={previewClass}>
            <div className="flex items-start justify-between gap-4">
              <div className={`min-w-0 text-sm ${mutedClass}`}>
                {logo && <img src={logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
                <p className="font-semibold">{businessName}</p>
                <p>{[ownerName, businessEmail, businessPhone].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="shrink-0 text-right">
                {approval && <div className="mb-1"><ApprovalBadge approval={approval} /></div>}
                {recurringFrom && !isProposal && <p className="change-order-badge mb-1 mr-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="recurring-badge">Recurring</p>}
                {changeOrderOf && !isProposal && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
                <p className={`text-xs uppercase tracking-wide ${labelClass}`}>{isProposal ? "Proposal" : "Invoice"}</p>
                <h2 className="text-xl font-semibold leading-tight">{invoiceNumber || (isProposal ? "PROP-0000" : "INV-0000")}</h2>
                <div className={`text-sm ${mutedClass}`}>
                  <div>Date: {invoiceDate || "-"} · {isProposal ? "Valid until" : "Due"}: {dueDate || "-"}</div>
                  {(jobStart || jobEnd) && <div>Time: {jobStart || "-"} to {jobEnd || "-"}</div>}
                  {changeOrderOf && !isProposal && <div data-testid="change-order-link">Change order to <a className="underline" href={`/invoice?id=${encodeURIComponent(changeOrderOf.id)}`}>{changeOrderOf.number}</a></div>}
                  {recurringFrom && !isProposal && <div className="print-hide" data-testid="recurring-link">Recurring from <a className="underline" href={`/invoice?id=${encodeURIComponent(recurringFrom.id)}`}>{recurringFrom.number}</a></div>}
                  {!isProposal && <ChangeOrderNotes notes={changeOrderNotes} className="text-xs" />}
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm">
              <p className={`text-xs ${labelClass}`}>{isProposal ? "Prepared for" : "Bill to"}</p>
              <p className="font-medium">{clientName || "Client name"}{clientCompany && <span className={`font-normal ${mutedClass}`}> · {clientCompany}</span>}</p>
              {(clientEmail || clientPhone) && <p className={mutedClass}>{[clientEmail, clientPhone].filter(Boolean).join(" · ")}</p>}
              {clientAddress && <p className={mutedClass}>{clientAddress}</p>}
            </div>
            <div className="mt-4 border-t border-slate-500 pt-1">
              {items.map((item, index) => {
                const amount = amountOf(item.qty) * amountOf(item.rate);
                return <div key={index} className="flex justify-between gap-4 py-1 text-sm"><span>{item.description || "Item"}</span><span>${amount.toFixed(2)}</span></div>;
              })}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-6 border-t border-slate-500 pt-2 text-sm">
              <div className={`space-y-0.5 ${mutedClass}`}>
                <LineSplit items={items} labelClass={labelClass} />
                {payments.filter((payment) => amountOf(payment.amount) > 0).length > 0 && <p className={`text-xs ${labelClass}`}>{isProposal ? "Deposit" : "Payments"}</p>}
                {payments.filter((payment) => amountOf(payment.amount) > 0).map((payment) => (
                  <div key={payment.id} className="flex justify-between gap-2"><span>{[payment.date, payment.method, payment.ref].filter(Boolean).join(" · ") || "Payment"}</span><span>${amountOf(payment.amount).toFixed(2)}</span></div>
                ))}
                {!isProposal && paymentLink && <p className="break-all pt-1 text-xs">Pay here: {paymentLink}</p>}
              </div>
              <div className="space-y-0.5">
                <div className="flex justify-between"><span>Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
                {totals.discount > 0 && <div className="flex justify-between"><span>{discountLabel(discountType, discountValue)}</span><span>-${totals.discount.toFixed(2)}</span></div>}
                <div className="flex justify-between"><span>Tax</span><span>${totals.tax.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
                {totals.paid > 0 && <div className="flex justify-between"><span>{isProposal ? "Deposit paid" : "Paid"}</span><span>-${totals.paid.toFixed(2)}</span></div>}
                {(!isProposal || totals.paid > 0) && <div className="mt-1 flex justify-between border-t border-slate-500 pt-1 text-lg font-bold"><span>{isProposal ? "Balance after deposit" : "Still owed"}</span><span data-testid="preview-still-owed">${totals.balance.toFixed(2)}</span></div>}
              </div>
            </div>
            {notes && <p className={`mt-3 text-sm ${mutedClass}`}>{notes}</p>}
            <JobPhotoStrip photos={photos} muted={mutedClass} />
            {(payUrl && !isProposal) || signature || (proposalSignature && !isProposal) ? (
              <div className="print-keep mt-3 grid grid-cols-2 items-end gap-6 border-t border-slate-500 pt-3">
                <div className="space-y-3">
                  {!isProposal && <SignatureBlock signature={proposalSignature} label="Proposal accepted" muted={mutedClass} onDark={style === "bold"} />}
                  <SignatureBlock signature={signature} label={isProposal ? "Customer acceptance" : "Customer signature"} muted={mutedClass} onDark={style === "bold"} />
                </div>
                <div className="flex justify-end">{!isProposal && <PayQr url={payUrl} />}</div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
function CrewSpend({ docId }: { docId: string }) {
  const [rows, setRows] = useState<{ id: string; worker_name: string; kind: string; amount: string; note: string; receipt: string }[]>([]);
  useEffect(() => {
    if (!docId) return;
    supabase.from("crew_expenses").select("*").eq("doc_id", docId).then(({ data }) => setRows(data || []));
  }, [docId]);
  if (!rows.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-amber-300/40 p-3 text-sm">
      <p className="font-medium">Crew reported spend</p>
      <p className="mt-1 text-xs text-[var(--cr-muted)]">Check the receipt before you change your fee. This does not change the invoice.</p>
      {rows.map((row) => (
        <div key={row.id} className="mt-2">
          <p>{row.worker_name} · {row.kind} · ${row.amount} · {row.note}</p>
          {row.receipt && <a href={row.receipt} target="_blank" className="text-xs underline">Open receipt</a>}
        </div>
      ))}
    </div>
  );
}