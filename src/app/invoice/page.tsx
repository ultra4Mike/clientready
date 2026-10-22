"use client";

import { CONTACT_METHODS, contactMethodLabel, readContactMethod } from "@/lib/contact-method";
import Link from "next/link";
import PortalShare from "@/components/PortalShare";
import Section, { SectionDefaults, useOpenedExisting } from "@/components/Section";
import EmailComposer from "@/components/EmailComposer";
import StageBar from "@/components/StageBar";
import { applyCrewAmount, CREW_KINDS, crewKindLabel, estimateByKind, isCrewKind, readCostLines, type CostFields, type CostLine, type CrewKind } from "@/lib/cost-categories";
import { documentStage, NEXT_LABEL, STAGE_LABEL, STAGES } from "@/lib/doc-stage";
import { readEmailLog, type EmailLogEntry } from "@/lib/email";
import { clientIdFor } from "@/lib/portal";
import JobDonePanel from "@/components/JobDonePanel";
import { StageEditor, StageSchedule } from "@/components/StageSchedule";
import { balanceLabel, readStages, type Stage } from "@/lib/stages";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveCloudDocument } from "@/lib/cloud-docs";
import { displayStatus } from "@/lib/doc-status";
import InventoryUse, { type StockUse } from "@/components/InventoryUse";
import { OwnerVisitNotes } from "@/components/CrewVisitNote";
import { refreshEmployeesCache } from "@/lib/account-cache";
import { paySnapshot, readPaySettings, rowPayMoney, type PayType } from "@/lib/pay-types";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { getTrialState } from "@/lib/trial";
import { priceSummary, PRICES_ARE_PLACEHOLDERS } from "@/lib/plans";
import { syncClientContact } from "@/lib/client-sync";
import { clientOptedOut, noteReviewAsked, reviewAskedAt, reviewMailHref, reviewMessage, reviewSmsHref } from "@/lib/review-request";
import { jobProfit } from "@/lib/job-profit";
import { CARD_FEE_PASS_THROUGH } from "@/lib/flags";
import { JobProfitBreakdown } from "@/components/JobProfitBreakdown";
import VisitNotes, { readVisitNotes, type VisitNote } from "@/components/VisitNotes";
import { crewReportTotal, profitAlerts, readMinMargin, readSetAside } from "@/lib/profit-alerts";
import { readLateFeeSettings, suggestedLateFee, type LateFeeSettings } from "@/lib/late-fees";
import { saveCrewJobs } from "@/lib/crew";
import { depositInvoice, missingDeposits } from "@/lib/proposal-deposit";
import { docTotal } from "@/lib/review";
import { balanceDue, owedAfterRefunds, refundState, refundedTotal, paidTotal, tipTotal, paymentFields, methodLabel, paymentMethods, paymentRequirement, readPayments, type Payment } from "@/lib/payments";
import { JobPhotosEditor, JobPhotoStrip } from "@/components/JobPhotos";
import { currentDocId } from "@/lib/doc-sync";
import { isQuotaError, readPhotos, type JobPhoto } from "@/lib/photos";
import LineSplit from "@/components/LineSplit";
import PayOptions from "@/components/PayOptions";
import { mileage, saveInvoiceTrip } from "@/lib/mileage";
import { readHoursApprovals, type HoursApproval } from "@/lib/hours-approval";
import { markPaidChoices, readLocalPaymentMethods, type PaymentMethodsConfig } from "@/lib/payments/providers";
import { completeMessage, mailHref, scheduledMessage } from "@/lib/job-messages";
import { clientFromRow, readCachedClients } from "@/lib/client-rows";
import { ownerRating, starsText, type Rating } from "@/lib/ratings";
import { applyPackage, deletePackage, readPackages, savePackage, syncPackages, type JobPackage } from "@/lib/packages";
import ReminderPanel from "@/components/ReminderPanel";
import { normalizeCategory, type LineCategory } from "@/lib/line-split";
import { appendChangeOrderNote, changeOrderData, changeOrdersFor, mergeChangeOrderNotes, readChangeOrderNotes, readChangeOrderOf, type ChangeOrderNote, type ChangeOrderOf } from "@/lib/change-orders";
import ChangeOrderNotes from "@/components/ChangeOrderNotes";
import { ApprovalBadge, ApprovalShare } from "@/components/Approval";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import RestoreDraftBanner from "@/components/RestoreDraftBanner";
import FormDraft from "@/components/FormDraft";
import ScheduleEditor from "@/components/ScheduleEditor";
import { entryHours, fmtHours, hoursByWorker, ownerEditClock, fixTimeProblem, crewFixReason, refreshOwnerClock, type ClockEntry } from "@/lib/clock";
import { confirmRemoval, jobDonePhotos, crewForWorkers, followSchedule, jobScheduleFromForm, crewIds, workLogged, clockHoursFor, dedupeWorkerIds, readSchedule, readWorkers, saveAssignment, saveSchedule, syncScheduleCrewJobs, STATUS_LABEL, type Schedule, type Worker } from "@/lib/schedule";
import { createClientFromInvoice } from "@/lib/client-create";
import { defaultInvoiceTerms } from "@/lib/terms";
import OverlapBadge from "@/components/OverlapBadge";
import { bookingConflicts, clockText, readOverrides, type Conflict, type Override } from "@/lib/conflicts";
import { readApproval, refreshApproval, type Approval } from "@/lib/approval";
import { generateNextNow, readRecurring, readRecurringFrom, scheduleFromForm, type Frequency, type RecurringFrom } from "@/lib/recurring";
import PayQr from "@/components/PayQr";
import { invoiceQrUrl, payUrlFor } from "@/lib/pay-link";
import { printOrigin } from "@/lib/site";
import SignaturePad, { SignatureBlock } from "@/components/SignaturePad";
import { readSignature, type Signature } from "@/lib/signature";
import { amountOf, documentTotals, discountLabel, normalizeDiscountType, type DiscountType } from "@/lib/discount";

type LineItem = { description: string; qty: string; rate: string; category?: LineCategory };
type SavedClient = { id: string; name: string; company: string; email: string; phone: string; address: string; preferences?: string; contactMethod?: string };
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
  /** R55: exact clocked minutes (pay uses these; only the money is rounded). */
  clockMinutes?: number;
  payType?: PayType;
  fixedPay?: string;
  payOverride?: string;
};
type DocKind = "invoice" | "proposal";

const emptyItem: LineItem = { description: "", qty: "1", rate: "" };
const CARD_FEE_PREFIX = "Card processing fee";
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
/** Saved documents (for the "invoiced" proposal stage). */
function docsForStage(): { id?: string; type: string; data?: Record<string, unknown> }[] {
  try { return typeof window === "undefined" ? [] : JSON.parse(window.localStorage.getItem("clientready-documents") || "[]"); } catch { return []; }
}
function rowPay(row: CrewRow) {
  // R55 + pay types: exact clocked minutes for hourly; fixed day / per job / owner override; money rounded once.
  return rowPayMoney(row);
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
    const clockMinutes = clocked * 60;
    return row.hours === hours && row.hoursFromClock && row.clockMinutes === clockMinutes ? row : { ...row, hours, hoursFromClock: true, clockMinutes };
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
  const [legacyPaymentIds, setLegacyPaymentIds] = useState<string[]>([]);
  const [docKind, setDocKind] = useState<DocKind>("invoice");
  const [clientName, setClientName] = useState("");
  // Saved client this document belongs to (stable across renames); "" = match by name.
  const [clientId, setClientId] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [stockUsed, setStockUsed] = useState<StockUse[]>([]); // R88
  const [depositPercent, setDepositPercent] = useState(""); // R90: proposal asks for this % on approval
  const [contactName, setContactName] = useState(""); // R85: optional, who reminders greet
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("INV-1001");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [jobStart, setJobStart] = useState("");
  const [jobMiles, setJobMiles] = useState("");
  const [hoursApprovals, setHoursApprovals] = useState<Record<string, HoursApproval>>({});
  const [visitNotes, setVisitNotes] = useState<VisitNote[]>([]);
  const [jobEnd, setJobEnd] = useState("");
  const [notes, setNotes] = useState("Payment is due within 14 days.");
  const [taxPercent, setTaxPercent] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [noLateFee, setNoLateFee] = useState(false);
  const [rebillRefund, setRebillRefund] = useState(false); // R126
  const [discountValue, setDiscountValue] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [proposalSignature, setProposalSignature] = useState<Signature | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [docPayLink, setDocPayLink] = useState("");
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [showPhotos, setShowPhotos] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [changeOrderOf, setChangeOrderOf] = useState<ChangeOrderOf | null>(null);
  const [fromProposal, setFromProposal] = useState<{ id: string; number: string } | null>(null);
  const [madeInvoices, setMadeInvoices] = useState<{ id: string; number: string }[]>([]);
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
  const [notFound, setNotFound] = useState<"" | "checking" | "missing">(""); // R102
  // Autosave plan: nothing saves (or creates a new doc) before the opened document has loaded into the form.
  const [formReady, setFormReady] = useState(false);
  const formReadyRef = useRef(false);
  useEffect(() => { formReadyRef.current = formReady; }, [formReady]);
  // R101: a new doc whose number was already used gets the next free number from the server.
  useEffect(() => {
    const onRenumber = (event: Event) => { const { from, to } = (event as CustomEvent<{ from: string; to: string }>).detail || {}; if (!to) return; setInvoiceNumber((current) => (current === from ? to : current)); setSaveMessage(`${from} was already used, so this one is ${to}.`); };
    window.addEventListener("clientready-renumbered", onRenumber);
    return () => window.removeEventListener("clientready-renumbered", onRenumber);
  }, []);
  // R83: photos the crew took when marking the job done.
  const [crewPhotos, setCrewPhotos] = useState<Awaited<ReturnType<typeof jobDonePhotos>>>([]);
  useEffect(() => { let live = true; if (docId) jobDonePhotos(docId).then((rows) => live && setCrewPhotos(rows)).catch(() => {}); else setCrewPhotos([]); return () => { live = false; }; }, [docId]);
  // R81: always re-read the team from the cloud once, so "+ Add crew" sees everyone Active.
  useEffect(() => { refreshEmployeesCache().then((ok) => { if (ok) setWorkers(readWorkers()); }).catch(() => {}); }, []);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [clockFix, setClockFix] = useState<{ id: string; start: string; end: string } | null>(null);
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [packages, setPackages] = useState<JobPackage[]>([]);
  const [packageName, setPackageName] = useState("");
  const [rating, setRating] = useState<Rating | null>(null);
  const [jobMsg, setJobMsg] = useState<{ kind: string; text: string } | null>(null);
  const [jobMsgCopied, setJobMsgCopied] = useState(false);
  const [payMethods, setPayMethods] = useState<PaymentMethodsConfig>({});
  const [markMethod, setMarkMethod] = useState("Cash");
  useEffect(() => { Promise.resolve().then(() => setPayMethods(readLocalPaymentMethods())); }, []);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => { if (live) setRating(null); });
    if (docId && /^[0-9a-f-]{36}$/i.test(docId)) ownerRating(docId).then((row) => { if (live) setRating(row); }).catch(() => {});
    return () => { live = false; };
  }, [docId]);
  useEffect(() => { Promise.resolve().then(() => setPackages(readPackages())); void syncPackages().then(setPackages); }, []);
  const [businessName, setBusinessName] = useState("Your business");
  const [ownerName, setOwnerName] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [savedClients, setSavedClients] = useState<SavedClient[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [status, setStatus] = useState("draft");
  const [paymentProblem, setPaymentProblem] = useState("");
  const [logo, setLogo] = useState("");
  const [style, setStyle] = useState("clean");
  const [paymentLink, setPaymentLink] = useState("");
  const [jobTime, setJobTime] = useState("");
  const [costs, setCosts] = useState<JobCosts>(emptyCosts);
  const [setAsidePercent, setSetAsidePercent] = useState("30");
  const [minMargin, setMinMargin] = useState(20);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crew, setCrew] = useState<CrewRow[]>([]);
  const [pickedEmployee, setPickedEmployee] = useState("");
  const [otherFees, setOtherFees] = useState<OtherFee[]>([]);
  /** Crew job report this invoice came from (cost lines by category). Shown next to the estimate; applied only by the owner's tap. */
  const [crewReport, setCrewReport] = useState<CrewReport | null>(null);
  const [locked, setLocked] = useState(false);
  const [daysLeft, setDaysLeft] = useState(14);

  const isProposal = docKind === "proposal";
  const [reviewLink, setReviewLink] = useState("");
  const [reviewAsked, setReviewAsked] = useState("");
  const [reviewCopied, setReviewCopied] = useState(false);
  const [lateFeeSettings, setLateFeeSettings] = useState<LateFeeSettings>(() => readLateFeeSettings(null));

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
    setSetAsidePercent(String(readSetAside(profile.setAsidePercent)));
    setMinMargin(readMinMargin(profile));
    setLateFeeSettings(readLateFeeSettings(profile));
    setReviewLink(profile.reviewLink || "");
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
      const next = rows.map((row) => clientFromRow(row as Record<string, unknown>, readCachedClients()));
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
        const params = new URLSearchParams(window.location.search);
        const kind: DocKind = wanted === "proposal" || params.get("type") === "proposal" ? "proposal" : "invoice";
        window.localStorage.removeItem("clientready-new-type");
        // New document for a saved client (/invoice?clientId=...): copy that client's details in.
        // Only for new documents; an opened document always keeps its own stored client details.
        const forClient = params.get("clientId");
        if (forClient) {
          const clients = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]") as SavedClient[];
          const client = clients.find((item) => item.id === forClient);
          if (client) {
            setClientName(client.name || "");
            setClientId(client.id);
            setClientCompany(client.company || "");
            setClientEmail(client.email || "");
            setClientPhone(client.phone || "");
            setClientAddress(client.address || "");
          }
        }
        setDocKind(kind);
        // R106: Calendar "New job" starts with a visit today (time and crew to fill in).
        if (new URLSearchParams(window.location.search).get("visit")) { setSchedule({ date: ymd(new Date()), startTime: "", workerIds: [], status: "scheduled", updatedAt: "" } as Schedule); setScheduleKey((key) => key + 1); window.setTimeout(() => document.getElementById("schedule")?.scrollIntoView({ block: "start" }), 300); }
        setInvoiceNumber(nextNumber(kind));
        setInvoiceDate(ymd(new Date()));
        setDueDate(plusDays(kind === "proposal" ? 14 : defaultInvoiceTerms().days));
        setNotes(kind === "proposal" ? "This proposal is valid for 14 days." : defaultInvoiceTerms().notes);
        // Crew job report opened from /drafts (R82: costs go into Job costs; client carried; one invoice per report).
        const draftRaw = window.localStorage.getItem("clientready-open-draft");
        if (draftRaw) {
          window.localStorage.removeItem("clientready-open-draft");
          const draft = JSON.parse(draftRaw) as Record<string, unknown>;
          const text = (key: string) => String(draft[key] || "");
          // R82: one crew report makes one invoice. If it was opened before, open that invoice again.
          const savedDocs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
          const linked = savedDocs.find((item) => (text("opened_doc_id") && item.id === text("opened_doc_id")) || ((item.data as Record<string, unknown> | undefined)?.crewReport as { draftId?: string } | undefined)?.draftId === text("id"));
          if (linked) { window.location.replace(`/invoice?id=${encodeURIComponent(linked.id)}`); return; }
          setClientName(text("client_name")); setClientSearch(text("client_name")); setClientPhone(text("client_phone")); setClientAddress(text("client_address"));
          // R82: carry the saved client (by name, else phone) so the invoice is linked to them.
          const key = (value: unknown) => String(value || "").trim().toLowerCase();
          const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
          const known = readCachedClients().find((client) => key(client.name) && key(client.name) === key(text("client_name"))) || readCachedClients().find((client) => digits(client.phone).length >= 7 && digits(client.phone) === digits(text("client_phone")));
          if (known?.id) {
            setClientId(known.id); setClientName(known.name || text("client_name")); setClientSearch(known.name || text("client_name"));
            setClientCompany(known.company || ""); setClientEmail(known.email || "");
            setClientPhone(text("client_phone") || known.phone || ""); setClientAddress(text("client_address") || known.address || "");
          }
          if (text("work_date")) setInvoiceDate(text("work_date"));
          setJobStart(text("start_time")); setJobEnd(text("end_time"));
          // R109: assign the crew member who filed it; their hours become qty at their rate, labor goes to job costs.
          const staff = JSON.parse(window.localStorage.getItem("clientready-employees") || "[]") as Employee[];
          const person = staff.find((item) => item.id && item.id === text("employee_id")) || staff.find((item) => key((item as { email?: string }).email) && key((item as { email?: string }).email) === key(text("worker_email"))) || staff.find((item) => key(item.name) && key(item.name) === key(text("worker_name")));
          const crewHours = Number(text("hours")) > 0 ? String(Number(text("hours"))) : "";
          let crewLabor = 0;
          if (person) {
            const row = {
              id: `crew-${person.id}`, employeeId: person.id, name: person.name, rate: person.rate,
              ...paySnapshot(readPaySettings((person as { paySettings?: unknown }).paySettings), person.rate),
              hours: crewHours, startTime: text("start_time"), endTime: text("end_time"), workDate: text("work_date"), note: "", bonus: "", paidToWorker: false, paidDate: "",
            } as CrewRow;
            setCrew([row]); crewLabor = rowPay(row);
          }
          setItems([{ ...emptyItem, description: text("work_done") || "Job", qty: crewHours || "1", rate: crewHours && person?.rate ? String(person.rate) : "" }]);
          const lines = readCostLines(draft);
          // R82: crew-reported costs go straight into Job costs (same math as "Use crew amounts").
          const byKind = new Map<CrewKind, number>();
          for (const line of lines) byKind.set(line.kind as CrewKind, (byKind.get(line.kind as CrewKind) || 0) + Number(line.amount || 0));
          let n = 0;
          let applied: CostFields & { otherFees: OtherFee[] } = { ...emptyCosts, otherFees: [] };
          for (const [kind, amount] of byKind) if (amount > 0) applied = applyCrewAmount(applied, kind, amount, () => `${Date.now()}-${n++}`) as typeof applied;
          const { otherFees: crewFees, ...crewCosts } = applied;
          setCosts((current) => ({ ...current, ...crewCosts, ...(crewLabor > 0 ? { labor: crewLabor.toFixed(2) } : {}), driveHours: text("drive_hours"), driveMinutes: text("drive_minutes"), notes: [text("notes"), text("collected_amount") ? `Collected ${text("collected_amount")} ${text("collected_method")}` : ""].filter(Boolean).join("\n") }));
          if (crewFees.length) setOtherFees(crewFees as OtherFee[]);
          // Always remember the report (even with no costs), so saving links it and a retry can't duplicate it.
          setCrewReport({ draftId: text("id"), worker: text("worker_name"), lines: lines.map(({ receipt, ...line }) => ({ ...line, ...(receipt ? { hasReceipt: true } : {}) })) });
          setSaveMessage("Crew report loaded. Crew costs are in Job costs. Set the price, then save.");
        }
        return;
      }
      const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
      const doc = docs.find((item) => item.id === openId && (item.type === "invoice" || item.type === "proposal"));
      window.localStorage.removeItem("clientready-open-document");
      window.localStorage.removeItem("clientready-new-type");
      if (!doc) {
        // R102: never start (or number) a new invoice from a bad link. Look in the account once, else "not found".
        setNotFound("checking");
        void (async () => {
          const { data: auth } = await supabase.auth.getUser();
          const isId = /^[0-9a-f-]{36}$/i.test(openId);
          const { data: row } = auth.user && isId ? await supabase.from("documents").select("id, type, title, client_name, created_at, data").eq("id", openId).eq("user_id", auth.user.id).in("type", ["invoice", "proposal"]).maybeSingle() : { data: null };
          if (row) {
            const list = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
            window.localStorage.setItem("clientready-documents", JSON.stringify([...list.filter((item) => item.id !== row.id), { id: row.id, type: row.type, title: row.title || "", clientName: row.client_name || "", createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : "", data: row.data || {} }]));
            window.location.reload();
            return;
          }
          setNotFound("missing");
        })();
        return;
      }
      window.history.replaceState(null, "", `/invoice?id=${encodeURIComponent(doc.id)}`);
      const flash = window.localStorage.getItem("clientready-flash");
      if (flash) { window.localStorage.removeItem("clientready-flash"); window.setTimeout(() => setSaveMessage(flash), 0); }
      const data = (doc.data || {}) as {
        clientName?: string; clientCompany?: string; clientEmail?: string; clientPhone?: string; clientAddress?: string;
        invoiceNumber?: string; invoiceDate?: string; dueDate?: string; jobStart?: string; jobEnd?: string; notes?: string;
        taxPercent?: string; discountType?: string; discountValue?: string; noLateFee?: unknown; rebillRefund?: unknown; signature?: unknown; proposalSignature?: unknown; payLink?: string; photos?: unknown; showPhotos?: unknown; fromProposal?: { id?: string; number?: string }; changeOrderOf?: unknown; changeOrderNotes?: unknown; recurring?: unknown; recurringFrom?: unknown; approval?: unknown; items?: LineItem[]; status?: string; style?: string; jobTime?: string; jobCosts?: JobCosts; crew?: CrewRow[];
      };
      const kind: DocKind = doc.type === "proposal" ? "proposal" : "invoice";
      const loadedItems = Array.isArray(data.items) && data.items.length ? data.items.map((item) => ({ ...item, category: normalizeCategory(item.category) })) : [{ ...emptyItem }];
      const loadedCrew = Array.isArray(data.crew) ? data.crew : [];
      const loadedFees = Array.isArray(data.jobCosts?.otherFees) ? data.jobCosts.otherFees : [];
      setDocKind(kind);
      setDocId(doc.id);
      setClientName(data.clientName || "");
      setClientId(typeof (data as Record<string, unknown>).clientId === "string" ? String((data as Record<string, unknown>).clientId) : "");
      setClientCompany(data.clientCompany || "");
      setContactName(String((data as Record<string, unknown>).contactName || ""));
      setDepositPercent(String((data as Record<string, unknown>).depositPercent || ""));
      setStockUsed(Array.isArray((data as Record<string, unknown>).stockUsed) ? ((data as Record<string, unknown>).stockUsed as StockUse[]) : []);
      setClientEmail(data.clientEmail || "");
      setClientPhone(data.clientPhone || "");
      setClientAddress(data.clientAddress || "");
      setInvoiceNumber(data.invoiceNumber || (kind === "proposal" ? "PROP-1001" : "INV-1001"));
      setInvoiceDate(data.invoiceDate || ymd(new Date()));
      setDueDate(data.dueDate || plusDays(14));
      setJobStart(data.jobStart || "");
      setJobMiles(String((data as Record<string, unknown>).jobMiles ?? ""));
      setHoursApprovals(readHoursApprovals((data as Record<string, unknown>).hoursApprovals));
      setVisitNotes(readVisitNotes((data as Record<string, unknown>).visitNotes));
      setJobEnd(data.jobEnd || "");
      setNotes(data.notes || (kind === "proposal" ? "This proposal is valid for 14 days." : "Payment is due within 14 days."));
      setTaxPercent(data.taxPercent || "0");
      setDiscountType(normalizeDiscountType(data.discountType));
      setNoLateFee(data.noLateFee === true);
      setRebillRefund(data.rebillRefund === true);
      setDiscountValue(data.discountValue || "");
      setPayments(readPayments(data));
      // R56: only rows that were already saved without a method when the invoice was opened are exempt (R30).
      setLegacyPaymentIds(readPayments(data).filter((row) => (Number(String(row.amount).replace(/[^0-9.-]/g, "")) || 0) > 0 && !row.method.trim() && !(data as Record<string, unknown>).fromProposal).map((row) => row.id));
      setSignature(readSignature(data.signature));
      setProposalSignature(readSignature(data.proposalSignature));
      setPadKey((key) => key + 1);
      setDocPayLink(data.payLink || "");
      setPhotos(readPhotos(data.photos));
      setShowPhotos(data.showPhotos === true);
      setStages(readStages((data as Record<string, unknown>).stages));
      setChangeOrderOf(kind === "invoice" ? readChangeOrderOf(data.changeOrderOf) : null);
      setFromProposal(kind === "invoice" && data.fromProposal?.id ? { id: String(data.fromProposal.id), number: String(data.fromProposal.number || "proposal") } : null);
      // Invoices already made from this proposal (the proposal itself is never changed).
      setMadeInvoices(kind === "proposal" ? (docs as unknown as { id: string; type: string; title: string; data?: { invoiceNumber?: string; fromProposal?: { id?: string } } }[])
        .filter((item) => item.type === "invoice" && item.data?.fromProposal?.id === doc.id)
        .map((item) => ({ id: item.id, number: String(item.data?.invoiceNumber || item.title) })) : []);
      setChangeOrderNotes(readChangeOrderNotes(data.changeOrderNotes));
      const schedule = kind === "invoice" ? readRecurring(data.recurring) : null;
      setRecFreq(schedule && schedule.active ? schedule.frequency : "off");
      setRecInterval(String(schedule?.intervalDays || 30));
      setRecNext(schedule?.nextRunDate || "");
      setRecLoadedNext(schedule?.nextRunDate || "");
      setRecurringFrom(kind === "invoice" ? readRecurringFrom(data.recurringFrom) : null);
      setApproval(readApproval(data.approval));
      setEmailLog(readEmailLog((data as Record<string, unknown>).emailLog));
      setSchedule(readSchedule(doc.data as Record<string, unknown>));
      const loadedSchedule = (doc.data as Record<string, unknown>)?.schedule ? readSchedule(doc.data as Record<string, unknown>) : null;
      if (loadedSchedule?.startTime) { setJobStart(loadedSchedule.startTime); setJobEnd(loadedSchedule.endTime || ""); }
      setWorkers(readWorkers());
      setScheduleKey((key) => key + 1);
      // The cloud is the source of truth for approval (the customer approves there).
      refreshApproval(doc.id).then((latest) => {
        if (latest === undefined) return;
        setApproval(latest);
        // R80: an approved proposal reads Accepted in the status box too (never back to Draft/Sent).
        if (latest?.status === "approved" && doc.type === "proposal") setStatus((current) => (current === "draft" || current === "sent" ? "accepted" : current));
      });
      setItems(loadedItems);
      setClientSearch(data.clientName || "");
      setStatus(doc.type === "proposal" && readApproval(data.approval)?.status === "approved" && (!data.status || data.status === "draft" || data.status === "sent") ? "accepted" : data.status || "draft");
      setStyle(data.style || "clean");
      setJobTime(data.jobTime || "");
      setCosts({ ...emptyCosts, ...(data.jobCosts || {}), otherFees: loadedFees });
      setOtherFees(loadedFees);
      setCrewReport(readCrewReport((data as Record<string, unknown>).crewReport));
      setCrew(loadedCrew.map((row) => followSchedule({ ...row, bonus: row.bonus || "" }, (data as Record<string, unknown>).schedule ? readSchedule(data as Record<string, unknown>) : null)));
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
  // Runs right after the load effect above (same commit): the form now holds the opened/new document.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setFormReady(true); }, []);

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
    // R126: a refund on a paid-in-full invoice doesn't reopen a balance unless the owner re-bills it.
    return { ...base, paid, balance: isProposal ? balanceDue(base.total, paid, status) : owedAfterRefunds(base.total, payments, status, rebillRefund) };
  }, [items, taxPercent, discountType, discountValue, payments, status, rebillRefund, isProposal]);
  const refund = isProposal ? "" : refundState(totals.total, payments);

  // Never lose typed work: the editor's fields are kept as a draft until Save (schedule has its own autosave).
  const draftValue = { clientName, clientCompany, contactName, clientEmail, clientPhone, clientAddress, invoiceNumber, invoiceDate, dueDate, notes, items, taxPercent, discountType, discountValue, payments };
  const draft = useAutosaveDraft("doc", docId || `new-${docKind}`, draftValue, { enabled: formReady && notFound === "" });
  function restoreDraft() { restoreFrom(draft.accept() as Partial<typeof draftValue> | null); }
  function restoreFrom(v: Partial<typeof draftValue> | null) {
    if (!v) return;
    if (v.clientName !== undefined) setClientName(v.clientName); if (v.clientCompany !== undefined) setClientCompany(v.clientCompany);
    if (v.contactName !== undefined) setContactName(v.contactName); if (v.clientEmail !== undefined) setClientEmail(v.clientEmail);
    if (v.clientPhone !== undefined) setClientPhone(v.clientPhone); if (v.clientAddress !== undefined) setClientAddress(v.clientAddress);
    if (v.invoiceNumber !== undefined) setInvoiceNumber(v.invoiceNumber); if (v.invoiceDate !== undefined) setInvoiceDate(v.invoiceDate);
    if (v.dueDate !== undefined) setDueDate(v.dueDate); if (v.notes !== undefined) setNotes(v.notes);
    if (Array.isArray(v.items)) setItems(v.items); if (v.taxPercent !== undefined) setTaxPercent(v.taxPercent);
    if (v.discountType !== undefined) setDiscountType(v.discountType); if (v.discountValue !== undefined) setDiscountValue(v.discountValue);
    if (Array.isArray(v.payments)) setPayments(v.payments);
    setSaveMessage("Restored your unsaved changes. Press Save to keep them.");
  }

  // Picked client's id, else the one saved client with exactly this name (else none: match by name).
  const docClientId = clientId || clientIdFor({ clientName }, savedClients);
  // Read-only stage of what is on screen (never changes status).
  const docStage = documentStage(
    { id: docId, type: isProposal ? "proposal" : "invoice", data: { status, approval, schedule, items, payments, taxPercent, discountType, discountValue } },
    madeInvoices.length ? [{ type: "invoice", data: { fromProposal: { id: docId } } }] : []
  );
  // StageBar's button runs the existing screen action for the next step (owner click only; nothing automatic).
  const stageAction: { onNext?: () => void; href?: string } =
    docStage.next === "send" ? { onNext: () => setEmailOpen(true) }
    : docStage.next === "collect-payment" ? { onNext: () => setReminderOpen(true) }
    : docStage.next === "schedule" ? { href: "/calendar" }
    : docStage.next === "create-invoice" ? { onNext: () => void createInvoiceFromProposal() }
    : docStage.next === "complete-job" || docStage.next === "confirm-done" ? { href: "/calendar?view=day" }
    : {};

  function addPayment() {
    // R105: a proposal's first deposit defaults to its requested deposit % (R90), else the balance.
    const deposit = isProposal && Number(depositPercent) > 0 ? Math.round(totals.total * Number(depositPercent)) / 100 : 0;
    // R115: every new payment row defaults to what is still owed (total minus the rows already there).
    setPayments((current) => {
      const left = Math.max(0, Math.round((totals.total - paidTotal(current)) * 100) / 100);
      const amount = isProposal && !current.length && deposit ? deposit : left;
      return [...current, { id: Date.now().toString(), amount: amount > 0 ? amount.toFixed(2) : "", method: "Cash", date: ymd(new Date()), ref: "" }];
    });
  }
  const lateFee = isProposal || !docId ? null : suggestedLateFee({ settings: lateFeeSettings, status, dueDate, balance: totals.balance, items, today: ymd(new Date()), skip: noLateFee });

  /** Owner tap: append the suggested late fee as its own line. Existing lines stay as they are; nothing is saved until the owner saves. */
  function addLateFee() {
    if (!lateFee || locked) return;
    setItems((current) => [...current, { description: lateFee.description, qty: "1", rate: lateFee.amount.toFixed(2) }]);
    setSaveMessage(`Late fee of $${lateFee.amount.toFixed(2)} added as a new line. Review it, then save.`);
  }

  /** Backlog 8: optional card surcharge as its own labeled line (3% of the current total). Nothing is saved until the owner saves. */
  function addCardFee() {
    if (!CARD_FEE_PASS_THROUGH || locked || isProposal || !(totals.total > 0)) return;
    const amount = Math.round(totals.total * 3) / 100;
    setItems((current) => [...current, { ...emptyItem, description: `${CARD_FEE_PREFIX} (3%, credit card payments only)`, qty: "1", rate: amount.toFixed(2) }]);
    setSaveMessage(`Card fee of $${amount.toFixed(2)} added as its own line. Remove it if the customer doesn't pay by credit card.`);
  }

  /** Owner tap: record the remaining balance as a cash payment dated today, mark the invoice paid, and save. */
  async function markPaidCash() {
    const amount = totals.balance;
    if (locked || isProposal || !(amount > 0.004)) return;
    const method = markMethod || "Cash";
    if (!window.confirm(`Record a ${method === "Cash" ? "cash" : method} payment of $${amount.toFixed(2)} today and mark this invoice paid?`)) return;
    const nextPayments = [...payments.filter((payment) => Number(payment.amount) > 0), { id: Date.now().toString(), amount: amount.toFixed(2), method, date: ymd(new Date()), ref: "" }];
    setPayments(nextPayments);
    setStatus("paid");
    await saveDocument({ payments: nextPayments, status: "paid" });
  }
  function updatePayment(id: string, patch: Partial<Payment>) {
    setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment));
  }

  function chooseKind(kind: DocKind) {
    if (locked) return;
    setDocKind(kind);
    if (!docId) setInvoiceNumber(nextNumber(kind));
    if (kind === "proposal" && (status === "paid" || status === "overdue")) setStatus("sent");
    setNotes(kind === "proposal" ? "This proposal is valid for 14 days." : defaultInvoiceTerms().notes);
  }

  function chooseClient(client: SavedClient) {
    setClientName(client.name || "");
    setClientId(client.id || "");
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
    void createClientFromInvoice({ name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone, address: clientAddress }).then((id) => {
      if (id) setClientId(id);
      setSavedClients(JSON.parse(window.localStorage.getItem("clientready-clients") || "[]"));
      setSaveMessage("Client saved");
    });
  }

  function allowCrewChange() {
    if (status !== "paid") return true;
    return window.confirm("This invoice is paid. Changing crew pay can make the year log wrong. Continue?");
  }

  // R112: "+ Add crew" runs the same double-booking check as the schedule editor and calendar.
  const [crewClash, setCrewClash] = useState<{ personId: string; name: string; lines: string[]; conflicts: Conflict[] } | null>(null);
  function addCrew(force = false) {
    const person = employees.find((item) => item.id === (force && crewClash ? crewClash.personId : pickedEmployee));
    if (!person) return setSaveMessage("Pick an employee, then click Add");
    if (crew.some((row) => row.employeeId === person.id) || !dedupeWorkerIds([...crewIds(crew), person.id]).includes(person.id)) {
      return setSaveMessage(`${person.name} is already on this job.`);
    }
    const mine = { date: schedule?.date || invoiceDate, startTime: schedule?.startTime || jobStart, endTime: schedule?.endTime || jobEnd, workerIds: [person.id], status: schedule?.status, overrides: schedule?.overrides };
    const clash = bookingConflicts(docsForStage() as { id: string; data?: Record<string, unknown> }[], docId, mine);
    if (clash.length && !force) {
      setCrewClash({ personId: person.id, name: person.name, conflicts: clash, lines: clash.map((c) => `${person.name} is already on ${c.title} ${clockText(c.start)}–${clockText(c.end)}`) });
      return;
    }
    const overrides = force ? clash.map((c) => ({ workerId: c.workerId, otherDocId: c.docId, at: new Date().toISOString() })) : [];
    setCrewClash(null);
    if (!allowCrewChange()) return;
    const nextCrew = [...crew, {
      id: `crew-${person.id}`, employeeId: person.id, name: person.name, rate: person.rate,
      ...paySnapshot(readPaySettings((person as { paySettings?: unknown }).paySettings), person.rate),
      hours: "", startTime: schedule?.startTime || jobStart, endTime: schedule?.endTime || jobEnd, workDate: schedule?.date || invoiceDate, note: "", bonus: "", paidToWorker: false, paidDate: "",
    }];
    setCrew(nextCrew);
    setCosts((current) => ({ ...current, labor: nextCrew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) }));
    setPickedEmployee("");
    setSaveMessage(`${person.name} added. Pick the next person and click Add again.`);
    void shareAssignment(nextCrew, [], overrides);
  }

  /** Crew/pay section changed who is on the job: save it as the job's assignment (schedule.workerIds). */
  async function shareAssignment(nextCrew: CrewRow[], confirmed: string[] = [], overrides: Override[] = []) {
    if (!docId) return;
    try {
      let saved = await saveAssignment(docId, dedupeWorkerIds(crewIds(nextCrew)), confirmed);
      const current = saved?.data ? readSchedule(saved.data) : null;
      // "Assign anyway" is recorded on the job, same as Book anyway in the schedule editor.
      if (overrides.length && current) saved = await saveSchedule(docId, { ...current, overrides: [...readOverrides(current.overrides), ...overrides] }) || saved;
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
    const fixProblem = Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? "Enter both a start and an end time." : fixTimeProblem(start.toISOString(), end.toISOString()); // R121
    if (fixProblem) return setSaveMessage(fixProblem);
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
    if ("hours" in patch) patch = { ...patch, hoursFromClock: false, clockMinutes: undefined };
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

  /** Owner tap only: set the chosen job-cost categories to what the crew reported. */
  function useCrewAmounts(list: [CrewKind, number][]) {
    if (locked) return;
    let next: CostFields & { otherFees: OtherFee[] } = { ...costs, otherFees };
    let n = 0;
    for (const [kind, amount] of list) next = applyCrewAmount(next, kind, amount, () => `${Date.now()}-${n++}`) as typeof next;
    const { otherFees: fees, ...rest } = next;
    setCosts((current) => ({ ...current, ...rest }));
    setOtherFees(fees as OtherFee[]);
    setSaveMessage("Job costs updated from the crew amounts. Save to keep them.");
  }

  function clearForm() {
    if (locked) return;
    window.history.replaceState(null, "", "/invoice");
    setDocId(""); setClientSearch(""); setClientName(""); setClientId(""); setClientCompany(""); setContactName(""); setStockUsed([]); setDepositPercent(""); setClientEmail(""); setClientPhone(""); setClientAddress("");
    setInvoiceNumber(nextNumber(docKind)); setInvoiceDate(ymd(new Date())); setDueDate(plusDays(isProposal ? 14 : defaultInvoiceTerms().days)); setJobStart(""); setJobEnd("");
    setNotes(isProposal ? "This proposal is valid for 14 days." : defaultInvoiceTerms().notes);
    setTaxPercent("0"); setDiscountType("percent"); setDiscountValue(""); setPayments([]); setLegacyPaymentIds([]); setSignature(null); setProposalSignature(null); setPadKey((key) => key + 1); setDocPayLink(""); setPhotos([]); setShowPhotos(false); setChangeOrderOf(null); setFromProposal(null); setMadeInvoices([]); setChangeOrderNotes([]); setRecFreq("off"); setRecNext(""); setRecLoadedNext(""); setRecurringFrom(null); setApproval(null); setEmailLog([]); setEmailOpen(false); setSchedule(null); setItems([{ ...emptyItem }]); setSaveMessage(""); setStatus("draft");
    setStyle("clean"); setJobTime(""); setCosts(emptyCosts); setCrew([]); setOtherFees([]); setCrewReport(null);
  }

  /** `cash` (from "Mark paid in cash") saves with that payment list and status instead of the form's. */
  async function saveDocument(cash?: unknown) {
    const over = cash && typeof cash === "object" && Array.isArray((cash as { payments?: unknown }).payments) ? (cash as { payments: Payment[]; status: string }) : null;
    const savePayments = over ? over.payments : payments;
    const saveStatus = over ? over.status : status;
    if (locked) {
      setSaveMessage("Trial ended. Old documents stay viewable; saving new work needs a plan. Plan details coming soon (see Plans).");
      return;
    }
    // R116: a new client typed here is saved to Clients and linked to this document.
    let linkedClientId = docClientId;
    if (!linkedClientId && clientName.trim()) {
      linkedClientId = await createClientFromInvoice({ name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone, address: clientAddress }).catch(() => "");
      if (linkedClientId) { setClientId(linkedClientId); setSavedClients(JSON.parse(window.localStorage.getItem("clientready-clients") || "[]")); }
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    const localId = currentDocId(docId) || Date.now().toString();
    {
      // R56: proposals (deposits) are checked too, so a deposit without a method can't be copied to the invoice.
      const before = (docs as SavedDocument[]).find((item) => item.id === localId);
      const required = paymentRequirement(saveStatus, savePayments, before?.data?.status === "paid", before ? readPayments(before.data as never).filter((row) => legacyPaymentIds.includes(row.id)) : []);
      if (required) {
        setSaveMessage(required);
        setPaymentProblem(required);
        return;
      }
    }
    setPaymentProblem("");
    const labor = crew.length ? crew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) : costs.labor;
    // Change-order notes are append-only: keep whatever is stored, plus what this form loaded.
    const stored = (docs as SavedDocument[]).find((item) => item.id === localId);
    // One source of truth: crew rows take the schedule's date/times (rows paid to the worker keep theirs).
    // Scheduling has one source of truth (data.schedule). A changed Job start/end or crew work date
    // here moves the schedule; a job with a start time and no schedule yet gets one (on the calendar).
    const storedSchedule = isProposal ? (stored?.data?.schedule ? readSchedule(stored.data) : null) : jobScheduleFromForm(stored?.data?.schedule ? readSchedule(stored.data) : null, { jobStart, jobEnd, invoiceDate, crew });
    const savedCrew = crew.map((row) => followSchedule(row, storedSchedule));
    const keptNotes = mergeChangeOrderNotes(readChangeOrderNotes(stored?.data?.changeOrderNotes), changeOrderNotes);
    const recurring = isProposal ? null : scheduleFromForm(readRecurring(stored?.data?.recurring), { frequency: recFreq, intervalDays: recInterval, nextRunDate: recNext, loadedNextRunDate: recLoadedNext, today: ymd(new Date()) });
    const nextDoc = {
      id: localId,
      type: docKind,
      title: invoiceNumber || (isProposal ? "Proposal" : "Invoice"),
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: { clientName, ...(linkedClientId ? { clientId: linkedClientId } : {}), clientCompany, ...(contactName.trim() ? { contactName: contactName.trim() } : {}), ...(stockUsed.length ? { stockUsed } : {}), ...(isProposal && Number(depositPercent) > 0 ? { depositPercent: String(Math.min(Number(depositPercent), 100)) } : {}), clientEmail, clientPhone, clientAddress, invoiceNumber, invoiceDate, dueDate, jobStart, jobEnd, ...(jobMiles.trim() && !isProposal ? { jobMiles: jobMiles.trim() } : {}), ...(Object.keys(hoursApprovals).length ? { hoursApprovals } : {}), ...(visitNotes.length && !isProposal ? { visitNotes } : {}), notes, taxPercent, discountType, discountValue, ...(noLateFee ? { noLateFee: true } : {}), ...(rebillRefund ? { rebillRefund: true } : {}), discountAmount: totals.discount.toFixed(2), ...paymentFields(savePayments), signature, proposalSignature, payLink: docPayLink, photos, ...(showPhotos && photos.length ? { showPhotos: true } : {}), ...(stages.length && !isProposal ? { stages } : {}), ...(changeOrderOf && !isProposal ? { changeOrderOf } : {}), ...(fromProposal && !isProposal ? { fromProposal } : {}), ...(keptNotes.length ? { changeOrderNotes: keptNotes } : {}), ...(recurring ? { recurring } : {}), ...(recurringFrom && !isProposal ? { recurringFrom } : {}), ...(stored?.data?.approval ? { approval: stored.data.approval } : {}), ...(storedSchedule && (stored?.data?.schedule || !isProposal) ? { schedule: storedSchedule } : {}), ...((stored?.data as Record<string, unknown> | undefined)?.reviews ? { reviews: (stored?.data as Record<string, unknown>).reviews } : {}), ...((stored?.data as Record<string, unknown> | undefined)?.autoSent ? { autoSent: (stored?.data as Record<string, unknown>).autoSent } : {}), ...((stored?.data as Record<string, unknown> | undefined)?.reviewAskedAt ? { reviewAskedAt: (stored?.data as Record<string, unknown>).reviewAskedAt } : {}), ...((stored?.data as Record<string, unknown> | undefined)?.emailLog ? { emailLog: (stored?.data as Record<string, unknown>).emailLog } : {}), items, status: saveStatus, style, jobTime, jobCosts: { ...costs, labor, otherFees }, crew: savedCrew, ...(crewReport ? { crewReport } : {}) },
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
    // Miles on this invoice feed the Mileage log as one trip (updated or removed with the invoice's value).
    if (!isProposal) {
      const tripDate = (stored?.data?.schedule as { date?: string } | undefined)?.date || invoiceDate || ymd(new Date());
      saveInvoiceTrip(cloudId, { miles: jobMiles, date: tripDate, label: `Job ${invoiceNumber || "invoice"}${clientName ? ` · ${clientName}` : ""}`, previousId: localId });
      void mileage.sync().catch(() => {});
    }
    await saveCrewJobs(cloudId, {
      invoiceNumber,
      clientName,
      clientPhone,
      clientAddress,
      status: saveStatus,
      date: storedSchedule?.date || "",
      startTime: storedSchedule?.startTime || jobStart,
      endTime: storedSchedule ? storedSchedule.endTime || "" : jobEnd,
    }, savedCrew);
    await syncScheduleCrewJobs(nextDoc);
    const carried = isProposal ? await carryDepositToInvoice(cloudId, savePayments) : "";
    // R18: remember which invoice this crew report became, so opening the report again goes here.
    if (crewReport?.draftId && /^[0-9a-f-]{36}$/i.test(cloudId)) await supabase.from("job_drafts").update({ opened_doc_id: cloudId }).eq("id", crewReport.draftId).then(() => undefined, () => undefined);
    setWorkers(readWorkers());
    // Contact changes also go to the linked saved client (Clients page / portal).
    const clientsAfter = await syncClientContact(linkedClientId, { name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone, address: clientAddress }).catch(() => null);
    if (clientsAfter) setSavedClients(clientsAfter as SavedClient[]);
    if (storedSchedule && !isProposal) {
      // R123: only rebuild the schedule editor when the saved time really differs from what it shows;
      // re-keying on every invoice save reverted a date being typed and closed the time picker.
      const same = (x: Schedule | null, y: Schedule | null) => Boolean(x && y) && x!.date === y!.date && (x!.startTime || "") === (y!.startTime || "") && (x!.endTime || "") === (y!.endTime || "") && [...x!.workerIds].sort().join() === [...y!.workerIds].sort().join();
      const changedSchedule = !same(storedSchedule, schedule);
      setSchedule(storedSchedule); setJobStart(storedSchedule.startTime || jobStart); setJobEnd(storedSchedule.endTime || ""); setCrew(savedCrew); if (changedSchedule) setScheduleKey((key) => key + 1); }
    setSaveMessage(isProposal ? `Proposal saved${carried}` : "Invoice saved");
    draft.clear(cloudId);
    return cloudId;
  }

  async function saveJobSchedule(next: Schedule | null, options?: { keepOpen?: boolean; confirmed?: string[] }) {
    try {
      // R53: a new invoice can be scheduled right away; the draft is saved first (no "save the document first").
      let id = docId;
      // The whole-doc save must never race the first load: an opened ?id= doc that is not in the form yet
      // would otherwise be saved as a NEW document with what was just typed (misrouted typing).
      if (!formReadyRef.current || (!id && new URLSearchParams(window.location.search).get("id"))) return;
      if (!id) {
        id = (await saveDocument()) || "";
        if (!id) return;
      }
      const saved = await saveSchedule(id, next, options?.confirmed);
      const savedSchedule = saved ? readSchedule(saved.data) : null;
      setSchedule(savedSchedule);
      // One source of truth: the form's Job start/end show the schedule's times.
      if (savedSchedule) { setJobStart(savedSchedule.startTime || ""); setJobEnd(savedSchedule.endTime || ""); }
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
    if (locked) return setSaveMessage("Trial ended. Old documents stay viewable; saving new work needs a plan. Plan details coming soon (see Plans).");
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
  // R122: one change order per click; the button stays disabled until we navigate to it.
  const changeOrderBusy = useRef(false);
  const [creatingChangeOrder, setCreatingChangeOrder] = useState(false);
  async function createChangeOrder() {
    if (changeOrderBusy.current) return;
    changeOrderBusy.current = true; setCreatingChangeOrder(true);
    let leaving = false;
    try { leaving = await createChangeOrderOnce(); } finally {
      // Stays disabled while the page goes to the new change order; unlocks only if it stopped early.
      if (!leaving) { changeOrderBusy.current = false; setCreatingChangeOrder(false); }
    }
  }
  async function createChangeOrderOnce(): Promise<boolean> {
    if (locked) {
      setSaveMessage("Trial ended. Old documents stay viewable; saving new work needs a plan. Plan details coming soon (see Plans).");
      return false;
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? (JSON.parse(raw) as SavedDocument[]) : [];
    const original = docs.find((doc) => doc.id === docId && doc.type === "invoice");
    if (!original) { setSaveMessage("Save this invoice first, then create a change order."); return false; }
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
      return false;
    }
    if (noted) await saveCloudDocument(noted.original);
    // Full page load on purpose: the editor reads the document once on mount, so a client-side
    // push to the same route would keep showing the original invoice.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/invoice?id=${encodeURIComponent(cloudId)}`;
    return true;
  }

  /** R21: a deposit recorded on the proposal after its invoice was made goes onto that first invoice, if it is still unpaid. */
  async function carryDepositToInvoice(proposalId: string, proposalPayments: Payment[]): Promise<string> {
    const docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as SavedDocument[];
    const carrier = depositInvoice(docs as unknown as { id: string; type?: string; data?: Record<string, unknown> }[], proposalId) as SavedDocument | null;
    if (!carrier) return "";
    const data = (carrier.data || {}) as Record<string, unknown>;
    const current = readPayments(data);
    const missing = missingDeposits(proposalPayments, current);
    if (!missing.length) return "";
    const owed = balanceDue(docTotal(carrier as unknown as Parameters<typeof docTotal>[0]), paidTotal(current), data.status);
    if (data.status === "paid" || owed <= 0) {
      return `. The new deposit was not added to ${String(data.invoiceNumber || "the invoice")} because it is already paid.`;
    }
    const next = { ...carrier, data: { ...data, ...paymentFields([...current, ...missing]), fromProposal: { ...((data.fromProposal || {}) as Record<string, unknown>), depositApplied: true } } } as SavedDocument;
    const cloudId = await saveCloudDocument(next);
    next.id = cloudId;
    try {
      window.localStorage.setItem("clientready-documents", JSON.stringify(docs.map((doc) => (doc.id === carrier.id ? next : doc))));
    } catch { /* cloud copy is saved; this device catches up on next load */ }
    return `. Deposit of $${paidTotal(missing).toFixed(2)} added to ${String(data.invoiceNumber || "the invoice")}.`;
  }

  async function createInvoiceFromProposal() {
    if (locked) {
      setSaveMessage("Trial ended. Old documents stay viewable; saving new work needs a plan. Plan details coming soon (see Plans).");
      return;
    }
    const proposalId = currentDocId(docId);
    if (!proposalId) {
      setSaveMessage("Save the proposal first, then create the invoice.");
      return;
    }
    const raw = window.localStorage.getItem("clientready-documents");
    const docs = raw ? JSON.parse(raw) : [];
    // R21: the deposit goes on the first invoice only; another invoice from this proposal starts with no payments.
    const carrier = depositInvoice(docs, proposalId);
    const depositPaid = paidTotal(payments);
    if (madeInvoices.length && !window.confirm(`An invoice was already made from this proposal (${madeInvoices.map((item) => item.number).join(", ")}).${depositPaid > 0 ? ` The $${depositPaid.toFixed(2)} deposit is already on ${String((carrier?.data as { invoiceNumber?: string } | undefined)?.invoiceNumber || "that invoice")} and will NOT be copied to the new one.` : ""} Make another one?`)) return;
    const copyDeposit = !carrier;
    const number = nextNumber("invoice");
    const labor = crew.length ? crew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) : costs.labor;
    const nextDoc = {
      id: Date.now().toString(),
      type: "invoice",
      title: number,
      clientName: clientName || "No client",
      createdAt: new Date().toLocaleDateString(),
      data: {
        clientName, ...(docClientId ? { clientId: docClientId } : {}), clientCompany, clientEmail, clientPhone, clientAddress,
        invoiceNumber: number, invoiceDate: ymd(new Date()), dueDate: plusDays(defaultInvoiceTerms().days),
        jobStart, jobEnd, notes: defaultInvoiceTerms().notes, taxPercent, discountType, discountValue, discountAmount: totals.discount.toFixed(2), ...paymentFields(copyDeposit ? payments : []), signature: null, proposalSignature: signature, payLink: docPayLink, photos, ...(showPhotos && photos.length ? { showPhotos: true } : {}), fromProposal: { id: proposalId, number: invoiceNumber || "Proposal", ...(copyDeposit ? { depositApplied: true } : {}) }, items,
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
    const labor = crew.length ? crew.reduce((sum, row) => sum + rowPay(row), 0).toFixed(2) : costs.labor;
    const breakdown = jobProfit({ total: totals.total, data: { jobCosts: { ...costs, labor, otherFees }, payments, jobMiles, invoiceDate, schedule } });
    const leftOver = breakdown.profit;
    const setAside = leftOver > 0 ? leftOver * ((Number(setAsidePercent) || 0) / 100) : 0;
    return { jobCost, breakdown, leftOver, setAside, yours: leftOver - setAside };
  }, [costs, otherFees, totals.total, setAsidePercent, crew, payments, jobMiles, invoiceDate, schedule]);
  const jobAlerts = isProposal ? [] : profitAlerts({ total: totals.total, jobCost: jobMath.jobCost, crewTotal: crewReportTotal(crewReport), minMargin });

  const payUrl = payUrlFor(docPayLink, paymentLink);
  const qrUrl = invoiceQrUrl(approval?.token, printOrigin(), docPayLink, paymentLink);

  // Collapsible sections: a new document opens with everything open; an existing one opens with the
  // client details folded to a one-line summary. The user's own open/closed choices are kept per device.
  const openedExisting = useOpenedExisting();
  const sectionDefaults = useMemo(() => ({ collapsed: openedExisting ? ["client", "costs", "recurring"] : ["costs", "recurring"], scope: openedExisting ? "existing" : "new", scoped: ["client"] }), [openedExisting]);
  const clientSummary = [clientName, clientPhone, clientAddress].map((part) => part.trim()).filter(Boolean).join(" · ") || "No client yet";

  const previewClass = style === "bold" ? "rounded-2xl border border-slate-900 bg-slate-900 p-6 text-white shadow-sm" : "rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm";
  const mutedClass = style === "bold" ? "text-slate-300" : "text-slate-600";
  const labelClass = style === "bold" ? "text-slate-400" : "text-slate-500";

  if (notFound) {
    return (
      <AppShell title="Invoice">
        <div className="mx-auto max-w-md rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 text-center" data-testid="doc-not-found" data-state={notFound}>
          {notFound === "checking" ? <p role="status">Looking for this document…</p> : (
            <>
              <h2 className="text-xl font-bold">Invoice not found</h2>
              <p className="mt-2 text-sm text-[var(--cr-muted)]">This link doesn&apos;t match a document in your account. Nothing was created.</p>
              <div className="mt-4 flex justify-center gap-2"><a href="/documents" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 font-medium">All documents</a><a href="/invoice" className="inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950!">New invoice</a></div>
            </>
          )}
        </div>
      </AppShell>
    );
  }
  return (
    <SectionDefaults.Provider value={sectionDefaults}>
    <AppShell title={isProposal ? "New proposal" : "New invoice"}>
      <RestoreDraftBanner draft={draft.restorable} onRestore={restoreDraft} onDiscard={draft.discard} status={draft.status} conflict={Boolean(draft.conflict)} onResolve={(choice) => { void draft.resolve(choice).then((theirs) => { if (theirs) restoreFrom(theirs as never); }); }} />
      <FormDraft form="job-message" id={docId} enabled={formReady && Boolean(docId)} value={jobMsg || { kind: "", text: "" }} blank={{ kind: "", text: "" }} onRestore={(v) => setJobMsg(v.kind ? v : null)} what="message to the client" />
      <div className="print-hide mb-6 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0" data-testid="doc-stage" data-stage={docStage.stage} data-next-action={docStage.next}>
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">{isProposal ? "Proposal" : "Invoice"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{invoiceNumber || (isProposal ? "New proposal" : "New invoice")}</h2>
            <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-0.5 text-xs font-semibold" data-testid="doc-header-status">{displayStatus({ id: docId, type: isProposal ? "proposal" : "invoice", data: { status, approval, schedule, payments, items, taxPercent, discountType, discountValue, dueDate, stages } }, docsForStage()).label}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--cr-muted)]">{clientName || "No client yet"} · Total ${totals.total.toFixed(2)}</p>
        </div>
      </div>
      {docId && (
        <div className="print-hide mt-4 border-t border-teal-500/15 pt-4" data-testid="stage-bar" data-stage={docStage.stage} data-next-action={docStage.next}>
          <StageBar
            embedded
            stages={STAGES.map((stage) => STAGE_LABEL[stage])}
            current={STAGES.indexOf(docStage.stage)}
            nextActionLabel={NEXT_LABEL[docStage.next] || undefined}
            {...stageAction}
          />
        </div>
      )}
      </div>
      <section className="print-reset mx-auto grid max-w-6xl gap-6 py-2 sm:py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
        <form className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
{locked && (
            <div className="rounded-xl border p-4 text-sm shadow-sm" style={{ background: "#fef3c7", color: "#0f172a", borderColor: "#f59e0b" }} data-testid="trial-upgrade">
              <p className="font-semibold">Your free trial has ended.</p>
              <p>You can view and print old documents. New saves are locked.<span data-purchase> Plans: {priceSummary()}{PRICES_ARE_PLACEHOLDERS ? " (placeholder prices)" : ""}.</span></p>
              <Link href="/plans" data-purchase data-testid="trial-upgrade-plans" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">See plans</Link>
            </div>
          )}
          {!locked && daysLeft <= 5 && (
            <p className="text-sm text-slate-600">{daysLeft} day{daysLeft === 1 ? "" : "s"} left in the trial.</p>
          )}
          <fieldset disabled={locked} className="min-w-0 space-y-4 pb-6">
            <div className="flex gap-2">
              <button type="button" onClick={() => chooseKind("invoice")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${!isProposal ? "bg-teal-500 text-slate-950! shadow-sm" : "border border-slate-300 hover:border-teal-500"}`}>Invoice</button>
              <button type="button" onClick={() => chooseKind("proposal")} className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${isProposal ? "bg-teal-500 text-slate-950! shadow-sm" : "border border-slate-300 hover:border-teal-500"}`}>Proposal</button>
            </div>
            <h1 className="text-xl font-bold tracking-tight">{isProposal ? "Proposal details" : "Invoice details"}</h1>
            <p className="cr-group-heading !mt-2">Client &amp; schedule</p>
            <Section id="client" label="Client details" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5" summary={clientSummary}>
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
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client name" value={clientName} onChange={(event) => { setClientName(event.target.value); setClientId(""); }} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client company" value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Contact name (optional, used after Hi)" aria-label="Contact name" data-testid="contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client email" value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client phone" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} />
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Client address" value={clientAddress} onChange={(event) => setClientAddress(event.target.value)} />
            {(() => { const method = readContactMethod(savedClients.find((client) => client.id === docClientId)?.contactMethod); return method ? <p className="print-hide inline-flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-1.5 text-sm" data-testid="invoice-contact-method" data-method={method}><span aria-hidden="true">{CONTACT_METHODS.find((item) => item.value === method)?.icon}</span><span className="font-semibold text-teal-700 dark:text-teal-300">Best by:</span> {contactMethodLabel(method)}</p> : null; })()}
            {(() => { const prefs = savedClients.find((client) => client.id === docClientId)?.preferences?.trim(); return prefs ? <p className="print-hide flex items-start gap-2 rounded-lg border border-l-4 border-teal-500/30 border-l-teal-500 bg-teal-500/5 px-3 py-2.5 text-sm" data-testid="invoice-client-preferences"><span aria-hidden="true">⭐</span><span className="font-semibold text-teal-700 dark:text-teal-300">Client prefers:</span> {prefs}</p> : null; })()}
            <button type="button" onClick={saveClientFromForm} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Save as client</button>
            </Section>
            <Section id="details" label="Details" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Details & schedule</h2>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder={isProposal ? "Proposal number" : "Invoice number"} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              {isProposal ? <option value="accepted">Accepted</option> : <><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="void">Void</option></>}
            </select>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={style} onChange={(event) => setStyle(event.target.value)}>
              <option value="clean">Clean professional</option><option value="bold">Bold modern</option>
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-600">{isProposal ? "Proposal date" : "Invoice date"}<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></label>
              <label className="text-sm text-slate-600">{isProposal ? "Valid until" : "Due date"}<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
{!isProposal && <label className="text-sm text-slate-600">Miles driven for this job<input name="jobMiles" data-testid="job-miles" inputMode="decimal" placeholder="0" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500" value={jobMiles} onChange={(event) => setJobMiles(event.target.value)} /><span className="mt-1 block text-xs text-slate-500">Added to your Mileage log as one trip.</span></label>}
                            <label className="text-sm text-slate-600">Job start<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={jobStart} onChange={(event) => setJobStart(event.target.value)} /></label>
              <label className="text-sm text-slate-600">Job end<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={jobEnd} onChange={(event) => setJobEnd(event.target.value)} /></label>
            </div>
            </Section>
            <Section id="schedule" label="Schedule" className="print-hide space-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:p-5" testId="schedule-section">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Schedule</p>
                {schedule && <span className="text-xs" data-testid="schedule-summary">{schedule.date}{schedule.startTime ? ` ${schedule.startTime}` : ""}{schedule.endTime ? `–${schedule.endTime}` : ""} · {STATUS_LABEL[schedule.status]}</span>}
              </div>
              {!locked
                ? <ScheduleEditor key={scheduleKey} autoSave docId={docId} value={schedule} workers={workers} onSave={saveJobSchedule} confirmRemove={(ids) => confirmRemoval(workLogged(crew, ids, clockHoursFor(docId)))} />
                : <p className="text-xs text-slate-600">Save the document first, then schedule the job here or on the Calendar.</p>}
              {!isProposal && <VisitNotes notes={visitNotes} onChange={setVisitNotes} today={ymd(new Date())} disabled={locked} />}
              {docId && <OwnerVisitNotes docId={docId} />}
              {docId && <JobDonePanel docId={docId} schedule={schedule} onConfirmed={(next) => { setSchedule(next); setScheduleKey((key) => key + 1); }} />}
            </Section>
            <p className="cr-group-heading">Line items</p>
            <Section id="items" label="Line items" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Line items & pricing</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="font-medium">Line items</h2><button type="button" className="tap rounded-lg border border-teal-500/40 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300" onClick={() => setItems((current) => [...current, { ...emptyItem }])}>Add item</button></div>
              {CARD_FEE_PASS_THROUGH && !isProposal && !locked && totals.total > 0 && !items.some((item) => String(item.description || "").startsWith(CARD_FEE_PREFIX)) && (
                <details className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm" data-testid="card-fee">
                  <summary className="cursor-pointer text-slate-600">Pass card processing fee to the customer (optional)</summary>
                  <p className="mt-1 text-xs text-slate-500">Adds a clearly labeled line: {CARD_FEE_PREFIX} (3%) = ${(totals.total * 0.03).toFixed(2)}. Only if they pay by credit card; remove it if they pay cash, check or bank. Not allowed on debit cards, and some states ban or cap card surcharges, so check your state first.</p>
                  <button type="button" data-testid="card-fee-add" onClick={addCardFee} className="mt-2 min-h-11 rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 dark:text-teal-300">Add card fee line</button>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-teal-500/30 bg-teal-500/5 p-2.5 text-sm" data-testid="packages">
                <select aria-label="Add a package" data-testid="package-add" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm" value="" onChange={(event) => { const pkg = packages.find((p) => p.id === event.target.value); if (pkg) setItems((current) => applyPackage(current, pkg)); }}>
                  <option value="">{packages.length ? "Add package…" : "No packages yet"}</option>
                  {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name} ({pkg.items.length} items)</option>)}
                </select>
                <input aria-label="Package name" name="packageName" data-testid="package-name" placeholder="Package name" className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent text-base sm:w-40 sm:flex-none sm:text-sm border border-slate-300 px-3 py-2" value={packageName} onChange={(event) => setPackageName(event.target.value)} />
                <button type="button" data-testid="package-save" disabled={!packageName.trim()} className="tap min-h-11 rounded-lg border border-teal-500/40 px-3 py-1.5 font-medium disabled:opacity-50" onClick={() => { setPackages(savePackage(packageName, items)); setPackageName(""); }}>Save items as package</button>
                {packages.length > 0 && <select aria-label="Delete a package" data-testid="package-delete" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm" value="" onChange={(event) => { if (event.target.value && window.confirm("Delete this package? Invoices that used it keep their items.")) setPackages(deletePackage(event.target.value)); }}>
                  <option value="">Delete package…</option>
                  {packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                </select>}
              </div>
              <div className="hidden gap-2 border-b border-slate-200 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_8.5rem]"><span>Description</span><span>Qty</span><span>Rate</span><span>Type</span></div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_8.5rem] sm:border-0 sm:p-0">
                  <input className="col-span-2 sm:col-span-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Description" value={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Qty" value={item.qty} onChange={(event) => updateItem(index, "qty", event.target.value)} />
                  <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Rate" value={item.rate} onChange={(event) => updateItem(index, "rate", event.target.value)} />
                  <select aria-label="Item type" data-testid="item-category" className="col-span-2 w-full min-w-0 sm:col-span-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={item.category || ""} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, category: normalizeCategory(event.target.value) } : row))}>
                    <option value="">Unmarked</option>
                    <option value="labor">Labor</option>
                    <option value="materials">Materials</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="cr-panel space-y-1.5 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-600">Discount <span className="font-normal text-slate-500">(taken off before tax)</span></p>
              <div className="flex items-stretch gap-2">
                <div role="group" aria-label="Discount type" className="flex shrink-0 rounded-lg border border-slate-300 p-0.5">
                  <button type="button" data-testid="discount-type-percent" aria-pressed={discountType === "percent"} onClick={() => setDiscountType("percent")} className={`min-h-11 min-w-11 rounded-md px-4 text-sm font-semibold transition ${discountType === "percent" ? "bg-teal-500 text-slate-950!" : "text-slate-600 hover:bg-teal-500/10"}`}>%</button>
                  <button type="button" data-testid="discount-type-amount" aria-pressed={discountType === "amount"} onClick={() => setDiscountType("amount")} className={`min-h-11 min-w-11 rounded-md px-4 text-sm font-semibold transition ${discountType === "amount" ? "bg-teal-500 text-slate-950!" : "text-slate-600 hover:bg-teal-500/10"}`}>$</button>
                </div>
                <input aria-label="Discount value" data-testid="discount-value" className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-right text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" inputMode="decimal" placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 50.00"} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-600">Tax %
            <input inputMode="decimal" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-right text-sm tabular-nums shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Tax percent" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} />
            </label>
            <div className="ml-auto w-full max-w-xs space-y-1 rounded-xl border border-teal-500/30 bg-teal-500/5 p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="tabular-nums">${totals.subtotal.toFixed(2)}</span></div>
              {totals.discount > 0 && <div className="flex justify-between"><span className="text-slate-600">Discount</span><span className="tabular-nums">-${totals.discount.toFixed(2)}</span></div>}
              <div className="flex justify-between"><span className="text-slate-600">Tax</span><span className="tabular-nums">${totals.tax.toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-teal-500/30 pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums">${totals.total.toFixed(2)}</span></div>
            </div>
            {isProposal && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm" data-testid="deposit-request">
                <label htmlFor="deposit-percent" className="font-medium">Ask for a deposit</label>
                <select id="deposit-percent" data-testid="deposit-percent" disabled={locked} value={depositPercent} onChange={(event) => setDepositPercent(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 px-2">
                  <option value="">No deposit</option>
                  {["10", "25", "30", "50", "100"].map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
                {Number(depositPercent) > 0 && <span className="tabular-nums" data-testid="deposit-request-amount">${(totals.total * Number(depositPercent) / 100).toFixed(2)} due when approved</span>}
              </div>
            )}
            <Section id="payments" label="Payments" className="cr-panel space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pr-10 max-sm:pr-12">
                <h2 className="min-w-0 text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">{isProposal ? "Deposit received" : "Payments received"}</h2>
                {refund && (
                  <p data-testid="refund-state" data-state={rebillRefund ? "rebilled" : refund} className="w-full text-sm">
                    {refund === "refunded" ? "Refunded" : "Partially refunded"}: ${refundedTotal(payments).toFixed(2)} returned to the client. {rebillRefund ? "The refunded amount is owed again." : "Nothing is owed."}{" "}
                    <button type="button" data-testid="refund-rebill" onClick={() => setRebillRefund(!rebillRefund)} className="cr-btn cr-btn-text">{rebillRefund ? "Don't re-bill" : "Re-bill the refunded amount"}</button>
                  </p>
                )}
                <button type="button" className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border border-teal-500/40 px-3 text-sm font-medium text-teal-700 transition hover:bg-teal-500/10 sm:min-h-9 dark:text-teal-300" onClick={addPayment}>{payments.length ? "Add another payment" : isProposal ? "Add deposit" : "Add payment"}</button>
              </div>
              {payments.map((payment) => (
                <div key={payment.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">Amount paid<input className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 text-right tabular-nums" inputMode="decimal" placeholder="300" value={payment.amount} onChange={(event) => updatePayment(payment.id, { amount: event.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-600">Method<select className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" data-testid="payment-method" data-missing={!payment.method && Number(payment.amount) > 0 ? "true" : undefined} title={!payment.method && Number(payment.amount) > 0 ? "Saved before methods were required. Pick one if you know it." : undefined} value={payment.method} onChange={(event) => updatePayment(payment.id, { method: event.target.value })}><option value="">Choose…</option>{(payment.method && !paymentMethods.includes(payment.method) ? [payment.method, ...paymentMethods] : paymentMethods).map((method) => <option key={method} value={method}>{methodLabel(method)}</option>)}</select></label>
                  <label className="text-sm font-medium text-slate-600">Date paid<input type="date" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={payment.date} onChange={(event) => updatePayment(payment.id, { date: event.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-600 sm:col-span-2">Reference / note<input className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Check number, confirmation, last 4" value={payment.ref} onChange={(event) => updatePayment(payment.id, { ref: event.target.value })} /></label>
                  <label className="text-sm font-medium text-slate-600">Tip (optional, not part of the bill)<input name="paymentTip" data-testid="payment-tip" className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 text-right tabular-nums" inputMode="decimal" placeholder="0.00" value={payment.tip || ""} onChange={(event) => updatePayment(payment.id, { tip: event.target.value })} /></label>
                  <button type="button" className="min-h-11 justify-self-start rounded-lg px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300 sm:col-span-2" onClick={() => setPayments((current) => current.filter((item) => item.id !== payment.id))}>Remove payment</button>
                </div>
              ))}
              <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                <p className="text-sm tabular-nums text-slate-600">Total ${totals.total.toFixed(2)} · {isProposal ? "Deposit" : "Paid"} ${totals.paid.toFixed(2)}</p>
                <p className="text-right"><span className="block text-sm font-medium text-slate-600">{isProposal && totals.paid > 0 ? "Balance after deposit" : balanceLabel(totals.paid, totals.balance)}</span><span data-testid="still-owed" className={`text-2xl font-bold tabular-nums ${totals.balance <= 0.004 && totals.paid > 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}>${totals.balance.toFixed(2)}</span></p>
              </div>
            </Section>
            {!isProposal && <StageEditor stages={stages} onChange={setStages} total={totals.total} balance={totals.balance} dueDate={dueDate} />}
            </Section>
            <p className="cr-group-heading">Payments</p>
            <Section id="pay-photos" label="Payment, photos and notes" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Payment, photos & notes</h2>
            {!isProposal && (
              <label className="block text-sm font-medium text-slate-600">
                Pay link for this invoice (optional)
                <input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="https://… (uses your profile pay link if blank)" value={docPayLink} onChange={(event) => setDocPayLink(event.target.value)} />
                <span className="mt-1 block text-xs text-slate-600" data-testid="pay-qr-note">
                  {payUrl ? `"Scan to pay" QR will link to ${payUrl}` : docPayLink.trim() ? "Not a web link (must start with http:// or https://), so no QR code is shown." : "No web pay link yet, so no QR code is shown. Add one here or in Profile."}
                </span>
              </label>
            )}
            <JobPhotosEditor photos={photos} crewPhotos={crewPhotos} onChange={setPhotos} showOnCopy={showPhotos} onShowOnCopyChange={setShowPhotos} />
            <SignaturePad key={padKey} value={signature} onChange={setSignature} defaultName={clientName} />
            <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Section>
            <p className="cr-group-heading">Job extras</p>
            <Section id="costs" label="Your costs" className="owner-costs space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5">
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
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <p className="text-sm font-medium">Other fees</p>
                  <button type="button" className="rounded-lg bg-teal-500 max-sm:min-h-11 px-3 py-1.5 text-sm font-semibold text-slate-950! transition hover:bg-teal-400" onClick={() => setOtherFees((current) => [...current, { id: Date.now().toString(), name: "", amount: "" }])}>Add fee</button>
                  <button type="button" data-testid="add-dump-fee" className="rounded-lg border border-slate-300 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500" onClick={() => setOtherFees((current) => [...current, { id: Date.now().toString(), name: "Dump fee", amount: "" }])}>Add dump fee</button>
                </div>
                {otherFees.map((fee) => (
                  <div key={fee.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                    <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Dump fee, permit, parking" value={fee.name} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, name: event.target.value } : item))} />
                    <input className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="Cost" value={fee.amount} onChange={(event) => setOtherFees((current) => current.map((item) => item.id === fee.id ? { ...item, amount: event.target.value } : item))} />
                    <button type="button" className="min-h-11 rounded-lg border border-rose-500/40 px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 sm:min-h-10 dark:text-rose-300" onClick={() => setOtherFees((current) => current.filter((item) => item.id !== fee.id))}>Remove</button>
                  </div>
                ))}
              </div>
              <Section id="crew" label="Crew on this job" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
                <p className="text-sm font-medium text-slate-900">Crew on this job ({crew.length})</p>
                <div className="mt-2 flex gap-2">
                  <select className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={pickedEmployee} onChange={(event) => setPickedEmployee(event.target.value)}>
                    <option value="">Add an employee</option>
                    {employees.filter((person) => person.active !== false).map((person) => (
                      <option key={person.id} value={person.id}>{person.name} · ${Number(person.rate || 0).toFixed(2)}/hr</option>
                    ))}
                  </select>
                  <button type="button" data-testid="crew-add" onClick={() => addCrew()} className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50">Add</button>
                </div>
                {docId && !crewClash && <OverlapBadge docs={docsForStage() as { id: string; data?: Record<string, unknown> }[]} doc={(docsForStage() as { id: string; data?: Record<string, unknown> }[]).find((item) => item.id === docId) || { id: docId }} onMoved={() => window.location.reload()} />}
                {crewClash && (
                  <div role="alert" data-testid="crew-clash" className="mt-2 rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-semibold">Double-booked</p>
                    {crewClash.lines.map((line) => <p key={line}>{line}</p>)}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" data-testid="crew-clash-anyway" onClick={() => addCrew(true)} className="min-h-11 rounded-lg border border-amber-500 px-3 font-medium">Assign anyway</button>
                      <button type="button" data-testid="crew-clash-other" onClick={() => { setCrewClash(null); setPickedEmployee(""); document.getElementById("schedule")?.scrollIntoView({ behavior: "smooth" }); }} className="min-h-11 rounded-lg bg-amber-500 px-3 font-semibold text-slate-950!">Pick another time or worker</button>
                    </div>
                  </div>
                )}
                {crew.map((row) => (
                  <div key={row.id} className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-slate-900">
                    <p className="text-sm font-medium text-slate-900">{row.name} · ${Number(row.rate || 0).toFixed(2)}/hr saved on this job</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-sm text-slate-900">Work date<input type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.workDate} onChange={(event) => updateCrew(row.id, { workDate: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Hours<input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.hours} onChange={(event) => updateCrew(row.id, { hours: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">Start<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.startTime} onChange={(event) => updateCrew(row.id, { startTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900">End<input type="time" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.endTime} onChange={(event) => updateCrew(row.id, { endTime: event.target.value })} /></label>
                      <label className="text-sm text-slate-900 sm:col-span-2">Extra pay for this job<input className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" placeholder="100" value={row.bonus} onChange={(event) => updateCrew(row.id, { bonus: event.target.value })} /></label>
                      <label className="text-sm text-slate-900 sm:col-span-2">Override pay for this job <span className="text-xs text-slate-500">({row.payType === "day" ? `fixed day $${Number(row.fixedPay || 0).toFixed(2)}` : row.payType === "job" ? `set $${Number(row.fixedPay || 0).toFixed(2)} per job` : "hourly"}; leave blank to use it)</span><input data-testid={`crew-pay-override-${row.employeeId}`} inputMode="decimal" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={row.payOverride || ""} onChange={(event) => updateCrew(row.id, { payOverride: event.target.value })} /></label>
                    </div>
                    {(() => {
                      const mine = clockEntries.filter((entry) => entry.doc_id === docId && entry.employee_id === row.employeeId);
                      if (!mine.length) return null;
                      const clocked = mine.reduce((sum, entry) => sum + entryHours(entry), 0);
                      return (
                        <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-700" data-testid={`clock-${row.employeeId}`}>
                          <p className="font-medium">Clocked {fmtHours(clocked)} ({mine.length} entr{mine.length === 1 ? "y" : "ies"}) · {row.hoursFromClock ? "hours above come from the clock" : "your typed hours are kept"}</p>
                          {mine.some((entry) => entry.ended_at && Date.parse(entry.ended_at) - Date.parse(entry.started_at) < 60000) && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900" data-testid="clock-zero-warning">⚠ One entry is under a minute (0 minutes), likely a mis-tap. Use Fix time to correct it.</p>}
                          {mine.map((entry) => (
                            <div key={entry.id} className="mt-1 flex flex-wrap items-center gap-2" data-testid="owner-clock-entry">
                              <span>{new Date(entry.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {entry.ended_at ? new Date(entry.ended_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : <b className="text-amber-700">still clocked in</b>}</span>
                              {entry.edited_reason && <span className="italic">({entry.edited_reason})</span>}
                              {entry.phone_time && <span className="italic" data-testid="clock-phone-time" title="Tapped with no signal; the phone's time was used">(phone time)</span>}
                              <button type="button" className="underline" onClick={() => setClockFix({ id: entry.id, start: toLocalInput(entry.started_at), end: toLocalInput(entry.ended_at || new Date().toISOString()) })}>Fix</button>
                            </div>
                          ))}
                          {clockFix && mine.some((entry) => entry.id === clockFix.id) && (
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <label>Start<input type="datetime-local" className="ml-1 rounded-md border border-slate-300 px-1.5 py-0.5" value={clockFix.start} onChange={(event) => setClockFix({ ...clockFix, start: event.target.value })} /></label>
                              <label>End<input aria-label="Clock end" type="datetime-local" className="ml-1 rounded-md border border-slate-300 px-1.5 py-0.5" value={clockFix.end} onChange={(event) => setClockFix({ ...clockFix, end: event.target.value })} /></label>
                              <button type="button" onClick={saveClockFix} className="rounded-md bg-teal-500 max-sm:min-h-11 px-3 py-1.5 text-sm font-semibold text-slate-950! transition hover:bg-teal-400">Save time</button>
                              <button type="button" onClick={() => setClockFix(null)} className="underline">Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {(() => {
                      // Hours approval: scheduled vs clocked vs paid. Approving a different number puts it in the pay hours (owner tap); nothing else changes.
                      const mine = clockEntries.filter((entry) => entry.doc_id === docId && entry.employee_id === row.employeeId && entry.ended_at);
                      const clocked = Math.round(mine.reduce((sum, entry) => sum + entryHours(entry), 0) * 100) / 100;
                      const scheduled = Number(hoursBetween(schedule?.startTime || row.startTime, schedule?.endTime || row.endTime)) || 0;
                      const paid = Number(row.hours) || 0;
                      const approval = hoursApprovals[row.employeeId];
                      const state = approval && !approval.revokedAt ? (Math.abs(approval.hours - paid) < 0.005 ? "approved" : "changed") : "pending";
                      const approve = (hours: number, basis: HoursApproval["basis"]) => {
                        if (Math.abs(hours - paid) >= 0.005) updateCrew(row.id, { hours: hours.toFixed(2) });
                        setHoursApprovals((current) => ({ ...current, [row.employeeId]: { hours: Math.round(hours * 100) / 100, basis, at: new Date().toISOString() } }));
                        setSaveMessage("Hours approved. Save the document to keep it.");
                      };
                      return (
                        <div className={`rounded-xl border p-3 text-sm ${state === "changed" ? "cr-tone-warn border-amber-400 bg-amber-50" : state === "approved" ? "border-emerald-300 dark:border-emerald-700/70" : "border-slate-200"}`} data-testid={`hours-approval-${row.employeeId}`} data-state={state}>
                          <table className="w-full [&_td]:py-1 [&_tr+tr]:border-t [&_tr+tr]:border-slate-200/60"><tbody>
                            <tr><td>Scheduled</td><td className="text-right tabular-nums" data-testid="hours-scheduled">{scheduled ? `${scheduled.toFixed(2)} h` : "—"}</td></tr>
                            <tr><td>Clocked</td><td className="text-right tabular-nums" data-testid="hours-clocked">{mine.length ? `${clocked.toFixed(2)} h` : "—"}</td></tr>
                            {mine.filter((entry) => crewFixReason(entry)).map((entry) => (
                              <tr key={`why-${entry.id}`} data-testid="hours-fix-reason"><td colSpan={2} className="pt-1.5"><span className="cr-tone-warn block rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-900"><span className="font-semibold">Crew fixed the time:</span> “{crewFixReason(entry)}”</span></td></tr>
                            ))}
                            {(row.payType === "day" || row.payType === "job" || String(row.payOverride ?? "").trim()) && <tr data-testid="hours-pay-type"><td colSpan={2} className="text-xs">{String(row.payOverride ?? "").trim() ? `Pay overridden for this job: $${rowPay(row).toFixed(2)}` : row.payType === "day" ? `Fixed day: $${Number(row.fixedPay || 0).toFixed(2)} whatever the clock says` : `Set amount per job: $${Number(row.fixedPay || 0).toFixed(2)}`}. Hours are kept for records.</td></tr>}
                            <tr><td>Paid (hours above)</td><td className="text-right tabular-nums" data-testid="hours-paid">{paid.toFixed(2)} h</td></tr>
                          </tbody></table>
                          <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${state === "approved" ? "cr-tone-good bg-emerald-50 text-emerald-800" : state === "changed" ? "bg-amber-200/70 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100" : "bg-slate-100 text-slate-600 dark:bg-white/10"}`} data-testid="hours-approval-status">{state === "approved" ? `Approved ${approval!.hours.toFixed(2)} h (${approval!.basis}) · ${new Date(approval!.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : state === "changed" ? `Hours changed since you approved ${approval!.hours.toFixed(2)} h. Approve again.` : "Hours not approved yet"}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {mine.length > 0 && <button type="button" data-testid="approve-clocked" onClick={() => approve(clocked, "clocked")} className="min-h-11 rounded-lg border border-teal-500/50 px-3 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Approve clocked</button>}
                            {scheduled > 0 && <button type="button" data-testid="approve-scheduled" onClick={() => approve(scheduled, "scheduled")} className="min-h-11 rounded-lg border border-teal-500/50 px-3 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Approve scheduled</button>}
                            {paid > 0 && <button type="button" data-testid="approve-paid" onClick={() => approve(paid, "paid hours")} className="min-h-11 rounded-lg border border-teal-500/50 px-3 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Approve paid hours</button>}
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-sm text-slate-900">Paid this job: ${rowPay(row).toFixed(2)}</p>
                    <button type="button" onClick={() => removeCrewRow(row.id)} className="cr-link-danger inline-flex min-h-11 items-center bg-transparent px-1 text-sm font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-300">Remove from job</button>
                  </div>
                ))}
              </Section>
              <label className="block text-sm">Cost notes<textarea className="mt-1.5 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30" value={costs.notes} onChange={(event) => setCosts({ ...costs, notes: event.target.value })} /></label>
              <div className="space-y-1 text-sm">
                <JobProfitBreakdown profit={jobMath.breakdown} />
                {(costs.driveHours || costs.driveMinutes) && <p>Drive time: {costs.driveHours || "0"} hrs {costs.driveMinutes || "0"} min, not added to job cost</p>}

                <p>Set aside ({setAsidePercent}%): ${jobMath.setAside.toFixed(2)}</p>
                <p className="font-semibold">Yours after set-aside: ${jobMath.yours.toFixed(2)}</p>
                {jobAlerts.map((alert) => (
                  <p key={alert.kind} role="status" data-testid="profit-alert" data-kind={alert.kind} className={`rounded-lg border px-3 py-2 text-sm ${alert.kind === "loss" ? "border-rose-400/60 bg-rose-50 text-rose-800" : "border-amber-400/60 bg-amber-50 text-amber-900"}`}>⚠ {alert.text}</p>
                ))}
                {!isProposal && <InventoryUse used={stockUsed} onUsed={setStockUsed} fees={otherFees} onFees={(fees) => setOtherFees(fees as OtherFee[])} locked={locked} />}
                <CrewSpend docId={docId} estimate={{ ...costs, otherFees }} report={crewReport?.lines.length ? crewReport : null} locked={locked} onUse={useCrewAmounts} />
              </div>
            </Section>
            {docId && !locked && <Section id="approval" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5" label="Approval" headerFirst={false}><ApprovalShare docId={docId} approval={approval} onChange={setApproval} /></Section>}
            {docId && !locked && <Section id="portal" className="space-y-3 rounded-xl border border-slate-200 p-4 sm:p-5" label="Client portal" headerFirst={false}><PortalShare clientName={clientName} clientId={docClientId} /></Section>}
            {!isProposal && docId && (
              <Section id="recurring" label="Recurring" className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm sm:p-5" testId="recurring-section">
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
                  {recFreq !== "off" && !locked && <button type="button" onClick={generateRecurringNow} className="rounded-lg border border-slate-300 max-sm:min-h-11 px-3 py-1.5 text-sm font-medium transition hover:border-teal-500">Generate next invoice now</button>}
                </div>
                <p className="text-xs text-slate-600">Drafts are made when the app opens on or after the next run date. They are never sent or marked paid. Save the document to keep schedule changes.</p>
              </Section>
            )}
            {(fromProposal || madeInvoices.length > 0) && (
              <p className="print-hide text-sm text-slate-600" data-testid="proposal-link">
                {fromProposal ? <>Made from proposal <a className="font-medium text-teal-600 underline" href={`/invoice?id=${encodeURIComponent(fromProposal.id)}`}>{fromProposal.number}</a></> : <>Invoice made from this proposal: {madeInvoices.map((item, index) => <span key={item.id}>{index ? ", " : ""}<a className="font-medium text-teal-600 underline" href={`/invoice?id=${encodeURIComponent(item.id)}`}>{item.number}</a></span>)}</>}
              </p>
            )}
            <div className="cr-actionbar hide-fab print-hide -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-[var(--cr-card)]/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur sm:-mx-6 sm:gap-3 sm:px-6 max-sm:mx-0 max-sm:rounded-xl max-sm:border">
              <p className="mr-auto min-w-0 text-right tabular-nums max-sm:w-full max-sm:flex max-sm:items-baseline max-sm:justify-between sm:text-left" aria-live="polite"><span className="block text-xs font-medium text-[var(--cr-muted)]">{isProposal && totals.paid > 0 ? "Balance after deposit" : balanceLabel(totals.paid, totals.balance)}</span><span className="text-lg font-bold">${totals.balance.toFixed(2)}</span></p>
              {!locked && <button type="button" onClick={saveDocument} className="cr-btn cr-btn-primary px-6 max-sm:flex-1">Save document</button>}
              {isProposal && !locked && (
                <button type="button" onClick={createInvoiceFromProposal} className="cr-btn cr-btn-secondary">Create invoice</button>
              )}
              {!isProposal && !locked && docId && (
                <button type="button" data-testid="create-change-order" disabled={creatingChangeOrder} onClick={createChangeOrder} className="cr-btn cr-btn-secondary">{creatingChangeOrder ? "Creating…" : "Create change order"}</button>
              )}
              {!locked && <button type="button" onClick={clearForm} className="cr-btn cr-btn-text">Clear form</button>}
            </div>
            {saveMessage && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-slate-600" data-testid="save-message" data-kind={paymentProblem && saveMessage === paymentProblem ? "payment-required" : undefined}>{saveMessage}</p>}
          </fieldset>
        </form>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="print-hide mb-4 flex flex-wrap gap-2 sm:gap-3">
            <button type="button" onClick={() => window.print()} className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50">Print / Save PDF</button>
            {!locked && !isProposal && status !== "paid" && <button type="button" onClick={copyPayLink} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">{paymentLink.trim() ? "Pay / Copy pay link" : "Add how to pay"}</button>}
            {!locked && lateFee && (
              <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="late-fee" data-amount={lateFee.amount.toFixed(2)} data-days-late={lateFee.daysLate}>
                <p>Suggested late fee: <b>${lateFee.amount.toFixed(2)}</b> ({lateFee.daysLate} days past due, {lateFee.how}).{Number(taxPercent) > 0 ? " Tax % applies to it as a line item." : ""}</p>
                <span className="mt-1 flex flex-wrap gap-2">
                  <button type="button" data-testid="late-fee-add" onClick={addLateFee} className="rounded-lg border border-amber-500/50 px-3 py-1.5 text-sm font-medium max-sm:min-h-11">Add late fee line</button>
                  <button type="button" data-testid="late-fee-skip" onClick={() => { setNoLateFee(true); setSaveMessage("No late fees will be suggested for this invoice. Save to keep it."); }} className="rounded-lg px-3 py-1.5 text-sm text-[var(--cr-muted)] underline-offset-2 hover:underline max-sm:min-h-11">Don&apos;t suggest for this invoice</button>
                </span>
              </div>
            )}
            {!locked && !isProposal && noLateFee && (
              <p className="w-full text-xs text-[var(--cr-muted)]" data-testid="late-fee-skipped">Late fees off for this invoice. <button type="button" data-testid="late-fee-unskip" className="underline" onClick={() => setNoLateFee(false)}>Turn back on</button></p>
            )}
            {!isProposal && rating && (
              <p className="w-full rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm font-medium" data-testid="owner-rating" data-stars={rating.stars}>
                Customer rating: <span className="text-base tracking-wider text-amber-500" aria-label={`${rating.stars} of 5 stars`}>{starsText(rating.stars)}</span>{rating.comment ? <> · “{rating.comment}”</> : null}
              </p>
            )}
            {!isProposal && schedule?.date && (() => {
              const kind = schedule.status === "done" ? "complete" : "scheduled";
              const draft = kind === "complete" ? completeMessage(clientName, businessName, invoiceNumber) : scheduledMessage(clientName, businessName, schedule);
              const body = jobMsg && jobMsg.kind === `${kind}:${draft}` ? jobMsg.text : draft;
              const sms = reviewSmsHref(clientPhone, body);
              const mail = mailHref(clientEmail, kind === "complete" ? "Job complete" : "You're scheduled", body);
              return (
                <div className="w-full rounded-xl border border-teal-500/30 bg-teal-500/5 p-3 text-sm sm:p-4" data-testid="job-message" data-kind={kind}>
                  <p className="font-medium">{kind === "complete" ? "Draft: job complete" : "Draft: you're scheduled"} <span className="text-xs font-normal text-[var(--cr-muted)]">You send it yourself.</span></p>
                  <textarea aria-label="Message to client" name="jobMessage" data-testid="job-message-text" rows={3} className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 sm:text-sm" value={body} onChange={(event) => { setJobMsg({ kind: `${kind}:${draft}`, text: event.target.value }); setJobMsgCopied(false); }} />
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    {sms && <a href={sms} data-testid="job-message-sms" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400"><span aria-hidden="true">💬</span>Text</a>}
                    {mail && <a href={mail} data-testid="job-message-email" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-teal-500/40 px-4 font-medium transition hover:border-teal-400"><span aria-hidden="true">✉️</span>Email</a>}
                    <button type="button" data-testid="job-message-copy" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 font-medium transition hover:border-teal-500" onClick={() => { void navigator.clipboard?.writeText(body).catch(() => {}); setJobMsgCopied(true); }}>{jobMsgCopied ? "Copied" : "Copy"}</button>
                  </div>
                </div>
              );
            })()}
            {!isProposal && docId && (status === "paid" || schedule?.status === "done") && (() => {
              const asked = reviewAsked || reviewAskedAt(docId);
              const why = status === "paid" ? "Paid." : "Job done.";
              if (clientOptedOut(docClientId, clientName)) return <p className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-[var(--cr-muted)]" data-testid="review-optout">{clientName.trim() || "This client"} asked not to get review requests.</p>;
              if (!reviewLink.trim()) return <p className="w-full text-xs text-[var(--cr-muted)]" data-testid="review-request-setup">{why} Add a review link in <Link href="/profile" className="underline">Settings</Link> to ask {clientName.trim() || "this client"} for a review.</p>;
              const body = reviewMessage(clientName, businessName, reviewLink, status === "paid");
              const sms = reviewSmsHref(clientPhone, body);
              const mail = reviewMailHref(clientEmail, businessName, body);
              const opened = () => setReviewAsked(noteReviewAsked(docId));
              return (
                <div id="review-request" className="cr-panel w-full rounded-xl border border-teal-500/30 p-3 text-sm sm:p-4" data-testid="review-request" data-why={status === "paid" ? "paid" : "done"} data-asked={asked ? "1" : "0"}>
                  <p className="font-medium">Ask {clientName.trim() || "your client"} for a review</p>
                  <p className="mt-2 rounded-lg bg-teal-500/5 px-3 py-2 text-xs leading-relaxed text-[var(--cr-muted)]" data-testid="review-message">{body}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    {sms && <a href={sms} onClick={opened} data-testid="review-sms" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/40 px-4 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Text</a>}
                    {mail && <a href={mail} onClick={opened} data-testid="review-email" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/40 px-4 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300">Email</a>}
                    <button type="button" data-testid="review-copy" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-teal-500/40 px-4 font-medium text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300" onClick={() => { void navigator.clipboard?.writeText(body).catch(() => {}); setReviewCopied(true); opened(); }}>{reviewCopied ? "Copied" : "Copy"}</button>
                  </div>
                  {asked && <p className="mt-1 text-xs text-[var(--cr-muted)]" data-testid="review-asked">Opened {new Date(asked).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. You send it yourself.</p>}
                </div>
              );
            })()}
            {!locked && !isProposal && docId && status !== "paid" && totals.balance > 0.004 && (
              <span className="inline-flex flex-wrap items-center gap-2">
                <select aria-label="Paid with" name="markPaidMethod" data-testid="mark-paid-method" value={markMethod} onChange={(event) => setMarkMethod(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 text-sm">
                  {markPaidChoices(payMethods, paymentMethods).map((method) => <option key={method} value={method}>{methodLabel(method)}</option>)}
                </select>
                <button type="button" data-testid="mark-paid-cash" onClick={markPaidCash} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">{markMethod === "Cash" ? "Mark paid in cash" : `Mark paid by ${methodLabel(markMethod)}`} (${totals.balance.toFixed(2)})</button>
              </span>
            )}
            {!isProposal && docId && status !== "draft" && status !== "paid" && totals.balance > 0 && <button type="button" data-testid="invoice-reminder" onClick={() => setReminderOpen((open) => !open)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">Reminder</button>}
          </div>
          {docId && <div className="print-hide mb-4 -mt-2"><button type="button" data-testid="invoice-email" onClick={() => setEmailOpen((open) => !open)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium transition hover:border-teal-500 hover:text-teal-600">{emailOpen ? "Close email" : `Email ${isProposal ? "proposal" : "invoice"}…`}</button></div>}
          {emailOpen && docId && (
            <div className="print-hide mb-4">
              <EmailComposer
                docId={docId}
                isProposal={isProposal}
                status={status}
                clientName={clientName}
                contactName={contactName}
                clientCompany={clientCompany}
                clientEmail={clientEmail}
                clientId={docClientId}
                number={invoiceNumber}
                total={totals.total}
                owed={isProposal ? 0 : totals.balance}
                dueDate={dueDate}
                payUrl={payUrlFor(docPayLink, paymentLink)}
                businessName={businessName === "Your business" ? "" : businessName}
                ownerName={ownerName}
                approvalToken={approval?.token}
                log={emailLog}
                onLogged={(log, markedSent) => {
                  setEmailLog(log);
                  if (markedSent) setStatus("sent");
                }}
                onClose={() => setEmailOpen(false)}
              />
            </div>
          )}
          {reminderOpen && !isProposal && totals.balance > 0 && (
            <div className="print-hide mb-4">
              <ReminderPanel
                input={{ clientName, contactName, clientCompany, invoiceNumber, owed: totals.balance, dueDate, payUrl: payUrlFor(docPayLink, paymentLink), businessName: businessName === "Your business" ? "" : businessName, ownerName, today: ymd(new Date()) }}
                phone={clientPhone}
                email={clientEmail}
                prefer={readContactMethod(savedClients.find((client) => client.id === docClientId)?.contactMethod)}
                onClose={() => setReminderOpen(false)}
              />
            </div>
          )}
          <div id="preview" className={`${previewClass} relative`}>
            {!isProposal && totals.total > 0 && totals.balance <= 0.004 && status !== "draft" && <div aria-label="Paid" data-testid="paid-stamp" className="pointer-events-none absolute right-6 top-24 rotate-[-12deg] rounded-lg border-4 border-emerald-600 px-4 py-1 text-3xl font-black tracking-widest text-emerald-600 opacity-80">PAID</div>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className={`min-w-0 text-sm ${mutedClass}`}>
                {logo && <img src={logo} alt="Business logo" className="mb-2 h-10 w-auto" />}
                <p className="font-semibold">{businessName}</p>
                <p>{[ownerName, businessEmail, businessPhone].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="sm:shrink-0 sm:text-right">
                {approval && <div className="mb-1"><ApprovalBadge approval={approval} /></div>}
                {recurringFrom && !isProposal && <p className="change-order-badge mb-1 mr-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="recurring-badge">Recurring</p>}
                {changeOrderOf && !isProposal && <p className="change-order-badge mb-1 inline-block rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase tracking-wide" data-testid="change-order-badge">Change order</p>}
                <p className={`text-xs uppercase tracking-wide ${labelClass}`}>{isProposal ? "Proposal" : "Invoice"}</p>
                <h2 className="text-xl font-semibold leading-tight">{invoiceNumber || (isProposal ? "PROP-0000" : "INV-0000")}</h2>
                <div className={`text-sm ${mutedClass}`}>
                  <div>Date: {invoiceDate || "-"} · {!isProposal && totals.total > 0 && totals.balance <= 0.004 ? <span data-testid="preview-paid-in-full">Paid in full</span> : <>{isProposal ? "Valid until" : "Due"}: {dueDate || "-"}</>}</div>
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
            <div className="mt-2 grid grid-cols-2 gap-6 border-t border-slate-500 pt-2 text-sm tabular-nums">
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
                {totals.discount > 0 && <div className="flex justify-between" data-testid="preview-discount" data-amount={totals.discount.toFixed(2)}><span>{discountLabel(discountType, discountValue)}</span><span>-${totals.discount.toFixed(2)}</span></div>}
                <div className="flex justify-between"><span>Tax</span><span>${totals.tax.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
                {isProposal && Number(depositPercent) > 0 && <div className="flex justify-between" data-testid="preview-deposit-request"><span>Deposit requested ({depositPercent}%)</span><span>${(totals.total * Number(depositPercent) / 100).toFixed(2)}</span></div>}
                {totals.paid > 0 && <div className="flex justify-between text-emerald-700"><span>{isProposal ? "Deposit paid ✓" : "Paid"}</span><span>-${totals.paid.toFixed(2)}</span></div>}
                {tipTotal(payments) > 0 && <div className="flex justify-between" data-testid="tip-line"><span>Tip received, thank you</span><span>${tipTotal(payments).toFixed(2)}</span></div>}
                {(!isProposal || totals.paid > 0) && <div className="mt-1 flex justify-between border-t border-slate-500 pt-1 text-lg font-bold"><span data-testid="preview-balance-label">{isProposal ? "Balance after deposit" : balanceLabel(totals.paid, totals.balance)}</span><span data-testid="preview-still-owed">${totals.balance.toFixed(2)}</span></div>}
              </div>
            </div>
            {!isProposal && status !== "paid" && totals.balance > 0.004 && <PayOptions config={payMethods} amount={totals.balance} reference={invoiceNumber} />}
            {!isProposal && <StageSchedule stages={stages} total={totals.total} balance={totals.balance} muted={mutedClass} />}
            {notes && !(!isProposal && totals.total > 0 && totals.balance <= 0.004 && /\bdue\b/i.test(notes) && notes.length < 120) && <p className={`mt-3 text-sm ${mutedClass}`} data-testid="preview-notes">{notes}</p>}
            {showPhotos && <JobPhotoStrip photos={photos} muted={mutedClass} />}
            {(qrUrl && !isProposal) || signature || (proposalSignature && !isProposal) ? (
              <div className="print-keep mt-3 grid grid-cols-2 items-end gap-6 border-t border-slate-500 pt-3">
                <div className="space-y-3">
                  {!isProposal && <SignatureBlock signature={proposalSignature} label="Proposal accepted" muted={mutedClass} onDark={style === "bold"} />}
                  <SignatureBlock signature={signature} label={isProposal ? "Customer acceptance" : "Customer signature"} muted={mutedClass} onDark={style === "bold"} />
                </div>
                <div className="flex justify-end">{!isProposal && <PayQr url={qrUrl} />}</div>
              </div>
            ) : null}
            {!isProposal && !qrUrl && <p className="cr-qr-hint print-hide mt-4 flex items-start gap-2 rounded-lg border border-dashed border-slate-400/60 bg-slate-500/5 px-3 py-2.5 text-xs leading-relaxed text-slate-500" data-testid="qr-hint">No QR code yet. Make a customer link under Approval (or add a pay link) and a Scan to pay QR appears here and on the PDF.</p>}
          </div>
        </div>
      </section>
    </AppShell>
    </SectionDefaults.Provider>
  );
}
type CostEstimate = CostFields;
type CrewReport = { draftId: string; worker: string; lines: (Omit<CostLine, "receipt"> & { hasReceipt?: boolean })[] };
function readCrewReport(value: unknown): CrewReport | null {
  const raw = (value || null) as Partial<CrewReport> | null;
  if (!raw || !Array.isArray(raw.lines)) return null;
  const lines = raw.lines.filter((line) => line && isCrewKind(line.kind) && Number(line.amount) > 0).map((line) => ({ kind: line.kind, amount: String(line.amount), note: String(line.note || ""), ...(line.hasReceipt ? { hasReceipt: true } : {}) }));
  return lines.length || raw.draftId ? { draftId: String(raw.draftId || ""), worker: String(raw.worker || ""), lines } : null;
}

/** Owner only: what the crew spent per category next to the cost estimate. Changes job costs only when the owner taps "Use crew amount" / "Add all". */
function CrewSpend({ docId, estimate, report, locked, onUse }: { docId: string; estimate: CostEstimate; report: CrewReport | null; locked: boolean; onUse: (list: [CrewKind, number][]) => void }) {
  const [rows, setRows] = useState<{ id: string; worker_name: string; kind: string; amount: string; note: string; receipt: string }[]>([]);
  useEffect(() => {
    if (!docId) return;
    supabase.from("crew_expenses").select("*").eq("doc_id", docId).then(({ data }) => setRows(data || []));
  }, [docId]);
  const reportRows = (report?.lines || []).map((line, index) => ({ id: `report-${index}`, worker_name: report?.worker || "Crew", kind: line.kind as string, amount: line.amount, note: line.note, receipt: "", fromReport: true, hasReceipt: Boolean(line.hasReceipt) }));
  const all = [...rows.map((row) => ({ ...row, fromReport: false, hasReceipt: Boolean(row.receipt) })), ...reportRows];
  if (!all.length) return null;
  const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
  // Unknown kinds count as Other, so every crew dollar shows up in exactly one row.
  const spent = (kind: string) => all.filter((row) => (isCrewKind(row.kind) ? row.kind : "other") === kind).reduce((sum, row) => sum + num(row.amount), 0);
  const byKind = estimateByKind(estimate);
  const groups = CREW_KINDS.map(({ kind, label }) => ({ kind, label, est: byKind[kind].amount, actual: spent(kind), source: byKind[kind].source }));
  const shown = groups.filter((group) => group.est > 0 || group.actual > 0);
  const differing = shown.filter((group) => group.actual > 0 && Math.abs(group.actual - group.est) >= 0.005);
  const totalEstimate = shown.reduce((sum, group) => sum + group.est, 0);
  const totalActual = shown.reduce((sum, group) => sum + group.actual, 0);
  const diffClass = (diff: number) => (diff > 0.005 ? "font-semibold text-red-600" : diff < -0.005 ? "text-teal-700" : "");
  const diffText = (diff: number) => (Math.abs(diff) < 0.005 ? "on estimate" : diff > 0 ? `+$${diff.toFixed(2)} over` : `$${(-diff).toFixed(2)} under`);
  return (
    <div className="print-hide mt-4 rounded-xl border border-amber-200 bg-white p-3 text-sm text-slate-900 shadow-sm sm:p-4" id="crew-spend" data-testid="crew-vs-estimate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Crew spend vs your estimate</p>
        {differing.length > 1 && !locked && (
          <button type="button" data-testid="cve-use-all" className="min-h-11 rounded-lg bg-teal-500 px-3 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400" onClick={() => onUse(differing.map((group) => [group.kind, group.actual]))}>Add all crew amounts ({differing.length})</button>
        )}
      </div>
      <div className="-mx-3 mt-2 overflow-x-auto px-3 sm:mx-0 sm:px-0"><table className="w-full min-w-[30rem] text-left text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--cr-muted)]"><th className="pb-1 font-normal">Cost</th><th className="pb-1 text-right font-normal">Estimate</th><th className="pb-1 text-right font-normal">Crew spent</th><th className="pb-1 text-right font-normal">Difference</th><th /></tr></thead>
        <tbody>
          {shown.map(({ kind, label, est, actual, source }) => {
            const differs = actual > 0 && Math.abs(actual - est) >= 0.005;
            return (
              <tr key={kind} className="border-t border-amber-200/70 align-middle" data-testid="cve-row" data-kind={kind} data-estimate={est.toFixed(2)} data-crew={actual.toFixed(2)} data-differs={differs ? "1" : "0"}>
                <td className="py-2 pr-2"><span className="font-medium">{label}</span><span className="block text-xs text-[var(--cr-muted)]">Estimate from: {source}</span></td>
                <td className="py-2 text-right tabular-nums">${est.toFixed(2)}</td>
                <td className="py-2 text-right font-medium tabular-nums">${actual.toFixed(2)}</td>
                <td className="py-2 text-right tabular-nums">{differs ? <span data-testid="cve-diff" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${actual - est > 0 ? "cr-tone-bad border-rose-300 bg-rose-50 text-rose-800" : "cr-tone-warn border-amber-300 bg-amber-50 text-amber-900"}`}><span aria-hidden="true">{actual - est > 0 ? "▲" : "▼"}</span>{diffText(actual - est)}</span> : actual > 0 ? <span className="cr-tone-good inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"><span aria-hidden="true">✓</span>on estimate</span> : <span className="text-[var(--cr-muted)]">—</span>}</td>
                <td className="py-2 pl-2 text-right">{differs && !locked && <button type="button" data-testid={`cve-use-${kind}`} className="cve-btn min-h-11 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 font-semibold transition hover:border-teal-400 hover:bg-teal-500/10" onClick={() => onUse([[kind, actual]])}>{est > 0 ? "Use crew amount" : "Add to job costs"}</button>}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-amber-300 font-semibold" data-testid="cve-total"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">${totalEstimate.toFixed(2)}</td><td className="py-2 text-right tabular-nums">${totalActual.toFixed(2)}</td><td className={`py-2 text-right tabular-nums ${diffClass(totalActual - totalEstimate)}`}>{diffText(totalActual - totalEstimate)}</td><td /></tr>
        </tbody>
      </table></div>
      <p className="mt-2 text-xs text-[var(--cr-muted)]">From your crew&apos;s receipts and job report. Nothing changes until you tap a button, and then only your job costs (never the invoice).</p>
      {all.map((row) => (
        <div key={row.id} className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2" data-testid="cve-line" data-kind={row.kind} data-source={row.fromReport ? "report" : "expense"}>
          <p className="min-w-0 flex-1">{row.worker_name} · <span className="font-medium">{crewKindLabel(row.kind)}</span> · <span className="tabular-nums">${num(row.amount).toFixed(2)}</span> · {row.note}{row.fromReport ? " · job report" : ""}</p>
          {row.receipt ? <a href={row.receipt} download={`receipt-${row.id}.jpg`} className="inline-flex min-h-11 items-center text-xs font-medium text-teal-700 underline">Save receipt</a> : row.hasReceipt ? <a href="/documents?view=crew-drafts" className="inline-flex min-h-11 items-center text-xs font-medium text-teal-700 underline">Receipt on Crew drafts</a> : null}
        </div>
      ))}
    </div>
  );
}
