"use client";

import { checklistProgress, readChecklist, type ChecklistItem } from "@/lib/checklist";
import { nativePhotoClick } from "@/lib/native-camera";
import { confirmLogoutWithQueue, enqueue, flushQueue, isNetworkError, newUploadKey, queued, removeQueued, retryQueued, type QueueItem, type QueueKind } from "@/lib/photo-queue";
import EmptyState from "@/components/EmptyState";
import FormDraft from "@/components/FormDraft";
import { nextJob, recentJobs } from "@/lib/crew-next";
import CrewDaysOff from "@/components/CrewDaysOff";
import { CREW_KINDS, legacySummary, type CostLine, type CrewKind } from "@/lib/cost-categories";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { crewMarkDone, crewCheckItem, crewOnMyWay, omwTime, crewSetJobStatus, onMyWaySmsHref, STATUS_CLASS, STATUS_LABEL, type JobStatus } from "@/lib/schedule";
import { compressPhoto } from "@/lib/photos";
import CrewVisitNote from "@/components/CrewVisitNote";
import { compressImage, crewClockIn, crewClockOut, crewEditClock, entryHours, withQueuedClock, fmtHours, fmtTimer, type ClockEntry } from "@/lib/clock";

type Client = { id: string; name: string; phone: string; address: string };
type Job = {
  id: string;
  doc_id: string;
  client_name: string;
  client_phone: string;
  client_address: string;
  client_email?: string;
  schedule_status?: string;
  on_my_way_at?: string;
  done_confirmed?: boolean;
  job_date: string;
  start_time: string;
  end_time: string;
  invoice_number: string;
  hours: string;
  rate: string;
  pay: number;
  note: string;
  status: string;
  checklist?: unknown;
};
type Card = Job & { scheduled: boolean; crewNote: string; payRow?: Job; items: ChecklistItem[] };
type Expense = { id: string; doc_id: string; kind: string; amount: string; note: string; receipt?: string; created_at?: string };
type Draft = { id: string; client_name: string; work_date: string; hours: string; work_done: string; status: string };
type Tab = "today" | "week" | "hours" | "reports";
type Cache = { name: string; jobs: Job[]; clock: ClockEntry[]; expenses: Expense[]; drafts: Draft[] };

const empty = {
  clientName: "", clientPhone: "", clientAddress: "", workDone: "", workDate: "",
  startTime: "", endTime: "", hours: "",
  driveHours: "", driveMinutes: "", notes: "", finished: false, collectedAmount: "", collectedMethod: "cash",
};
type CostDraft = { id: string; kind: CrewKind; amount: string; note: string; receipt: string };
const newCostLine = (): CostDraft => ({ id: Math.random().toString(36).slice(2), kind: "parts", amount: "", note: "", receipt: "" });
// Same keys and names as the owner's job costs ("Crew spend vs your estimate" rows).
const KINDS = CREW_KINDS.map(({ kind, label }) => [kind, label] as const);
const input = "min-h-11 w-full rounded-xl border border-teal-700/40 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 dark:border-teal-500/30 dark:placeholder:text-slate-400 transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";
const ICON_PATHS = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  note: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M9 2h6",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  car: "M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 19v1.5M17 19v1.5M5 11h14",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
};
function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[name]} /></svg>;
}
const cardClass = "rounded-2xl border border-teal-700/30 bg-[var(--cr-card)] dark:border-teal-500/20 p-4 shadow-sm sm:p-5";

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(value: string, days: number) {
  const [y, m, d] = value.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + days));
}
function dayLabel(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function timeLabel(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function hoursBetween(start: string, end: string) {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? (mins / 60).toFixed(2) : "";
}
function localInput(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${ymd(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Today's stops in time order, plus one Google Maps directions link through every address (from current location). */
function routeStops(cards: Card[]) {
  const stops = cards.filter((card) => card.client_address?.trim() && card.schedule_status !== "done");
  const addresses = stops.map((card) => card.client_address.trim());
  if (!addresses.length) return { stops, url: "" };
  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(0, -1).join("|");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
  return { stops, url };
}

/** One card per job: schedule details (time, status, crew note) merged onto this worker's pay row. */
/** "past" | "today" | "upcoming" | "undated" for a job date vs today (both YYYY-MM-DD, phone's local day). */
function dayGroup(date: string, today: string) {
  if (!date || !today) return "undated";
  return date < today ? "past" : date === today ? "today" : "upcoming";
}

/** Applies checklist ticks still waiting in the offline queue (oldest first) on top of the loaded jobs. */
function withQueuedTicks(jobs: Job[], queue: QueueItem[], who: string): Job[] {
  const ticks = queue.filter((item) => item.kind === "check" && !item.lastError);
  if (!ticks.length) return jobs;
  return jobs.map((row) => {
    const mine = ticks.filter((item) => item.docId === row.doc_id);
    if (!mine.length || !row.id.includes("-sched-")) return row;
    let list = readChecklist(row.checklist);
    for (const tick of mine) list = list.map((entry) => entry.id === tick.payload.itemId ? (tick.payload.done ? { ...entry, done: true, doneBy: entry.doneBy || who } : { id: entry.id, text: entry.text }) : entry);
    return { ...row, checklist: list };
  });
}

function buildCards(jobs: Job[]): Card[] {
  const cards: Card[] = [];
  for (const job of jobs) {
    if (job.id.includes("-sched-")) continue;
    if (cards.some((card) => card.doc_id === job.doc_id)) {
      // A second pay row on the same job (another day): keep it as its own card.
      cards.push({ ...job, scheduled: false, crewNote: "", payRow: job, items: [] });
      continue;
    }
    cards.push({ ...job, scheduled: false, crewNote: "", payRow: job, items: [] });
  }
  for (const sched of jobs.filter((job) => job.id.includes("-sched-"))) {
    const index = cards.findIndex((card) => card.doc_id === sched.doc_id && !card.scheduled);
    const merged = {
      scheduled: true, schedule_status: sched.schedule_status, done_confirmed: Boolean(sched.done_confirmed), job_date: sched.job_date || "", start_time: sched.start_time,
      end_time: sched.end_time, client_email: sched.client_email, crewNote: sched.note || "", on_my_way_at: sched.on_my_way_at || "",
      items: readChecklist(sched.checklist),
    };
    if (index >= 0) cards[index] = { ...cards[index], ...merged, job_date: sched.job_date || cards[index].job_date };
    else cards.push({ ...sched, ...merged });
  }
  return cards.sort((a, b) => `${a.job_date || "9"}${a.start_time}`.localeCompare(`${b.job_date || "9"}${b.start_time}`));
}

export default function CrewPage() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadedClock, setClock] = useState<ClockEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  // Redesign 5: /crew?job=<doc id> opens one job's detail screen (no prices or pay).
  const [detailId, setDetailId] = useState("");
  useEffect(() => {
    const read = () => setDetailId(new URLSearchParams(window.location.search).get("job") || "");
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const [now, setNow] = useState(0);
  const [today, setToday] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [theme, setTheme] = useState("dark");
  const [form, setForm] = useState(empty);
  const [costLines, setCostLines] = useState<CostDraft[]>(() => [newCostLine()]);
  const [reportOpen, setReportOpen] = useState(false);
  const [spendOpen, setSpendOpen] = useState<string>("");
  const [doneFor, setDoneFor] = useState("");
  const [donePhotos, setDonePhotos] = useState<string[]>([]);
  const [spend, setSpend] = useState<{ kind: string; amount: string; note: string; receipt: string }>({ kind: "parts", amount: "", note: "", receipt: "" });
  const [fixing, setFixing] = useState<{ id: string; start: string; end: string; reason: string } | null>(null);

  async function load() {
    const { data, error: userError } = await supabase.auth.getUser();
    let user = data.user;
    // Offline: use the saved session so the cached jobs still show (and queued photos can wait).
    if (!user && userError && isNetworkError(userError.message)) user = (await supabase.auth.getSession()).data.session?.user ?? null;
    const me = (user?.email || "").toLowerCase();
    const ownRow = (row: object) => {
      const worker = String((row as { worker_email?: unknown }).worker_email || "").toLowerCase();
      return !worker || worker === me;
    };
    if (!user) {
      window.location.href = "/login";
      return;
    }
    // Only people on a crew list use this page. An owner who isn't on any employee list (their own
    // included) goes to the dashboard before anything is loaded or shown.
    const { data: person, error: personError } = await supabase.rpc("is_crew_email");
    const offline = Boolean(personError && isNetworkError(personError.message));
    const row = Array.isArray(person) ? person[0] : person;
    const cacheKey = `clientready-crew-cache-${user.id}`;
    if (!personError && !row) {
      window.localStorage.removeItem(cacheKey);
      window.location.replace("/dashboard");
      return;
    }
    setUserId(user.id);
    setEmail(user.email || "");
    // Show what this person saw last time right away (cache is per signed-in user).
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey) || "null") as Cache | null;
      if (cached) {
        setName(cached.name); setJobs(cached.jobs.filter(ownRow)); setClock(cached.clock.filter(ownRow)); setExpenses(cached.expenses.filter(ownRow)); setDrafts(cached.drafts.filter(ownRow));
      }
    } catch {
      window.localStorage.removeItem(cacheKey);
    }
    if (offline) {
      setOffline(true);
      refreshQueue(user.id);
      return;
    }
    setOffline(false);
    if (row) {
      setEmployeeId(row.id || "");
      setOwnerId(row.user_id || "");
    }
    // Every read below is limited to this person's own rows by the database (row-level security).
    const [employee, clientRows, jobRows, clockRows, spendRows, draftRows, receiptRows] = await Promise.all([
      supabase.from("employees").select("name").ilike("email", user.email || "").maybeSingle(),
      supabase.rpc("list_crew_clients"),
      supabase.from("crew_jobs").select("*").order("job_date", { ascending: true }),
      supabase.from("crew_clock").select("*").order("started_at", { ascending: true }),
      // Speed audit #3: no receipt images or draft cost photos here; only which expenses have a receipt.
      supabase.from("crew_expenses").select("id,doc_id,kind,amount,note,created_at,worker_email").order("created_at", { ascending: false }),
      supabase.from("job_drafts").select("id,client_name,work_date,hours,work_done,status,created_at,worker_email").order("created_at", { ascending: false }),
      supabase.from("crew_expenses").select("id").neq("receipt", "").not("receipt", "is", null),
    ]);
    const withReceipt = new Set(((receiptRows.data || []) as { id: string }[]).map((row) => row.id));
    // The database already limits crew to their own rows. An owner who is also on their own crew
    // list can read all of their workers' rows (owner access), so keep only this person's rows here.
    const next: Cache = {
      name: employee.data?.name || user.email || "",
      jobs: ((jobRows.data || []) as Job[]).filter(ownRow),
      clock: ((clockRows.data || []) as ClockEntry[]).filter(ownRow),
      expenses: ((spendRows.data || []) as Expense[]).filter(ownRow).map((item) => ({ ...item, receipt: withReceipt.has(item.id) ? "1" : "" })),
      drafts: ((draftRows.data || []) as Draft[]).filter(ownRow),
    };
    refreshQueue(user.id);
    if (navigator.onLine) void flushQueue(user.id, sendQueued).then((sent) => { refreshQueue(user.id); if (sent) setMessage(`Sent ${sent} saved upload${sent === 1 ? "" : "s"}.`); }).catch(() => undefined);
    setName(next.name); setJobs(next.jobs); setClock(next.clock); setExpenses(next.expenses); setDrafts(next.drafts);
    setClients((clientRows.data || []) as Client[]);
    try {
      // Receipts are left out of the cache to keep it small.
      window.localStorage.setItem(cacheKey, JSON.stringify({ ...next, expenses: next.expenses.map((item) => ({ ...item, receipt: item.receipt ? "1" : "" })) }));
    } catch {
      // storage full: the page still works from the network
    }
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("clientready-theme") || "dark";
    document.documentElement.classList.toggle("dark", saved === "dark");
    document.documentElement.classList.toggle("light", saved === "light");
    const tick = () => { setNow(Date.now()); setToday(ymd(new Date())); };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    const start = window.setTimeout(() => { setTheme(saved); load(); }, 0);
    const back = () => { setOffline(false); void load(); };
    // B2: a reschedule made while this app sat open shows up when the phone comes back to it.
    const seen = () => { if (document.visibilityState === "visible" && navigator.onLine) void load(); };
    document.addEventListener("visibilitychange", seen);
    // And while it stays open, a fresh read every minute (cheap: own rows only).
    const poll = window.setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) void load(); }, 60_000);
    const gone = () => setOffline(true);
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    return () => { window.clearInterval(timer); window.clearTimeout(first); window.clearTimeout(start); window.removeEventListener("online", back); window.removeEventListener("offline", gone); document.removeEventListener("visibilitychange", seen); window.clearInterval(poll); };
  }, []);

  function switchTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("clientready-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  function refreshQueue(user = userId) {
    if (!user) return;
    queued(user).then(setQueue).catch(() => setQueue([]));
  }

  async function sendQueued(item: QueueItem) {
    if (item.kind === "clock-in") return crewClockIn(item.docId, String(item.payload.at), item.id);
    if (item.kind === "clock-out") return crewClockOut(item.docId, String(item.payload.at), item.id);
    if (item.kind === "check") return crewCheckItem(item.docId, String(item.payload.itemId || ""), Boolean(item.payload.done));
    if (item.kind === "report") return insertReport(item.payload, item.id);
    if (item.kind === "done") return crewMarkDone(item.docId, (item.payload.photos as string[]) || [], item.id);
    return addExpense(item.docId, item.payload, item.id);
  }

  async function flush(user = userId) {
    if (!user || !navigator.onLine) return;
    const sent = await flushQueue(user, sendQueued).catch(() => 0);
    refreshQueue(user);
    if (sent) {
      setMessage(`Sent ${sent} saved upload${sent === 1 ? "" : "s"}.`);
      await load();
    }
  }

  /** Runs an upload; if the phone is offline it is saved on the device and sent later. */
  /** crew_add_expense with an idempotency key (falls back to the keyless call before migration 20261016100000). */
  async function addExpense(docId: string, payload: Record<string, unknown>, key: string) {
    let { error } = await supabase.rpc("crew_add_expense", { p_doc_id: docId, p_receipt: "", ...payload, p_client_key: key });
    if (error && /could not find the function|PGRST202/i.test(`${error.message} ${error.code || ""}`)) ({ error } = await supabase.rpc("crew_add_expense", { p_doc_id: docId, ...payload }));
    return error ? error.message : "";
  }

  /** One key per upload, used for the first try and every retry, so the server never adds it twice. */
  async function sendOrQueue(kind: QueueKind, docId: string, payload: Record<string, unknown>, send: (key: string) => Promise<string>) {
    const key = newUploadKey();
    const error = navigator.onLine ? await send(key).catch((reason: unknown) => String((reason as Error)?.message || reason)) : "offline";
    if (!error || !isNetworkError(error === "offline" ? "failed to fetch" : error)) return { error, queued: false };
    try {
      await enqueue({ id: key, user: userId, kind, docId, payload });
    } catch {
      return { error: "No signal, and this phone has no room to save it. Free up space or try again when online.", queued: false };
    }
    refreshQueue();
    return { error: "", queued: true };
  }

  async function act(key: string, work: () => Promise<string>, done: string) {
    setBusy(key);
    const error = await work();
    setBusy("");
    setMessage(error ? `Could not do that: ${error}` : done);
    if (!error) await load();
  }

  // Checklist ticks saved offline are shown as ticked until they send (they replay in order, before "done").
  const cards = useMemo(() => buildCards(withQueuedTicks(jobs, queue, name)), [jobs, queue, name]);
  // Clock taps saved offline show right away (the phone's tap time is sent when back online).
  const clock = useMemo(() => withQueuedClock(loadedClock, queue), [loadedClock, queue]);
  const open = clock.find((entry) => !entry.ended_at);
  const openCard = open ? cards.find((card) => card.doc_id === open.doc_id) : undefined;
  const openLabel = open ? `${openCard ? [openCard.invoice_number, openCard.client_name].filter(Boolean).join(" · ") || "another job" : "another job"} since ${clockTime(open.started_at)}` : "";
  const weekStart = today ? addDays(today, -new Date(`${today}T00:00:00`).getDay()) : "";
  const weekDays = weekStart ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) : [];
  const todayCards = cards.filter((card) => card.job_date === today);
  const weekCards = cards.filter((card) => weekDays.includes(card.job_date));
  const undated = cards.filter((card) => !card.job_date);
  // Past jobs from the two weeks before this one (date, time, client, status only; no prices).
  const recent = weekStart ? cards.filter((card) => card.job_date && card.job_date < weekStart && card.job_date >= addDays(weekStart, -14)).sort((a, b) => `${b.job_date}${b.start_time}`.localeCompare(`${a.job_date}${a.start_time}`)) : [];
  const lastWeekStart = weekStart ? addDays(weekStart, -7) : "";
  const later = cards.filter((card) => card.job_date && weekDays.length > 0 && card.job_date > weekDays[6]).sort((a, b) => a.job_date.localeCompare(b.job_date));

  const hoursByDay = weekDays.map((day) => {
    const clocked = clock.filter((entry) => ymd(new Date(entry.started_at)) === day).reduce((sum, entry) => sum + entryHours(entry, now), 0);
    const logged = jobs.filter((job) => !job.id.includes("-sched-") && job.job_date === day).reduce((sum, job) => sum + (Number(job.hours) || 0), 0);
    return { day, clocked, logged };
  });
  const weekClocked = hoursByDay.reduce((sum, item) => sum + item.clocked, 0);
  const weekLogged = hoursByDay.reduce((sum, item) => sum + item.logged, 0);
  const paidRows = jobs.filter((job) => job.status === "paid" && !job.id.includes("-sched-"));
  const confirmedPay = paidRows.reduce((sum, job) => sum + (Number(job.pay) || 0), 0);

  async function saveExpense(card: Card) {
    if (!spend.amount.trim()) return setMessage("Add the amount you spent.");
    await act(`spend-${card.doc_id}`, async () => {
      const payload = { p_kind: spend.kind, p_amount: spend.amount, p_note: spend.note, p_receipt: spend.receipt };
      const result = await sendOrQueue("expense", card.doc_id, payload, (key) => addExpense(card.doc_id, payload, key));
      if (!result.error) { setSpend({ kind: "parts", amount: "", note: "", receipt: "" }); setSpendOpen(""); }
      return result.queued ? "" : result.error;
    }, navigator.onLine ? "Expense added to this job." : "Saved on this phone. It will send when you're back online.");
  }

  async function pickDonePhotos(files: FileList | File[] | null) {
    if (!files?.length) return;
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) added.push(await compressPhoto(file));
      setDonePhotos((current) => [...current, ...added].slice(0, 6));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function tickItem(card: Card, itemId: string, done: boolean) {
    const flip = (value: boolean) => (rows: Job[]) => rows.map((row) => row.doc_id === card.doc_id && row.id.includes("-sched-")
      ? { ...row, checklist: readChecklist(row.checklist).map((item) => item.id === itemId ? (value ? { ...item, done: true, doneBy: name } : { id: item.id, text: item.text }) : item) }
      : row);
    setJobs(flip(done));
    const result = await sendOrQueue("check", card.doc_id, { itemId, done }, () => crewCheckItem(card.doc_id, itemId, done));
    if (result.error) { setJobs(flip(!done)); setMessage(result.error); }
  }

  /** Clock in/out with the tap time; with no signal it is saved on the phone and sent later. */
  async function clockTap(kind: "clock-in" | "clock-out", docId: string) {
    const at = new Date().toISOString();
    const label = kind === "clock-in" ? "Clocked in" : "Clocked out";
    await act(`clock-${docId}`, async () => (await sendOrQueue(kind, docId, { at }, (key) => (kind === "clock-in" ? crewClockIn : crewClockOut)(docId, at, key))).error,
      navigator.onLine ? `${label}.` : `${label} on this phone at ${clockTime(at)}. It will send when you're back online.`);
    // R54: reload once more shortly after, so a just-closed entry can't leave other jobs stuck on "On another job".
    if (kind === "clock-out" && navigator.onLine) window.setTimeout(() => { void load(); }, 1500);
    // R121: a clock-out within a minute of clocking in is almost always a mis-tap; say so (nothing is changed).
    const started = clock.find((entry) => entry.doc_id === docId && !entry.ended_at)?.started_at;
    if (kind === "clock-out" && started && Date.parse(at) - Date.parse(started) < 60000) {
      setMessage("That time entry is under a minute (0 minutes). If it was a mis-tap, use Fix time on this job to correct it.");
    }
  }

  async function markDone(card: Card) {
    await act(`status-${card.doc_id}`, async () => {
      const result = await sendOrQueue("done", card.doc_id, { photos: donePhotos }, (key) => crewMarkDone(card.doc_id, donePhotos, key));
      if (!result.error) { setDonePhotos([]); setDoneFor(""); }
      return result.error;
    }, navigator.onLine ? "Marked done. Your boss will confirm it." : "Saved on this phone with the photos. It will send when you're back online.");
  }

  /** One tap: camera first, then the expense form opens with the receipt attached and the amount box focused. */
  // R125: a job photo any time from the card (owner sees it in Job photos). Changes nothing else.
  async function addJobPhoto(docId: string, file: File | undefined) {
    if (!file) return;
    setBusy(`photo-${docId}`);
    try {
      const photo = await compressImage(file);
      const { data, error } = await supabase.rpc("crew_add_job_photo", { p_doc_id: docId, p_photo: photo, p_client_key: newUploadKey() });
      setMessage(error ? `Could not add the photo: ${error.message}` : data === false ? "Could not add the photo." : "Job photo added. The owner can see it on the job.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setBusy(""); }
  }

  async function snapReceipt(docId: string, file: File | undefined) {
    if (!file) return;
    setSpend({ kind: "parts", amount: "", note: "", receipt: "" });
    setSpendOpen(docId);
    await pickReceipt(file);
    window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-testid="expense-form-${docId}"] input[aria-label="Amount"]`)?.focus(), 0);
  }

  async function pickReceipt(file: File | undefined) {
    if (!file) return;
    try {
      const receipt = await compressImage(file);
      setSpend((current) => ({ ...current, receipt }));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function saveFix() {
    if (!fixing) return;
    if (fixing.reason.trim().length < 3) return setMessage("Say why you're changing the time (for your boss).");
    await act(`fix-${fixing.id}`, () => crewEditClock(fixing.id, new Date(fixing.start).toISOString(), new Date(fixing.end).toISOString(), fixing.reason), "Time corrected. Your boss will see the reason.");
    setFixing(null);
  }

  /** Job report insert; the upload key is the row id, so a retry after a lost reply cannot add it twice. */
  async function insertReport(row: Record<string, unknown>, key: string) {
    let { error } = await supabase.from("job_drafts").insert({ ...row, id: key });
    // Before migration 20261016120000 there is no costs column; parts_cost / parts_note still carry the total.
    if (error && /costs/.test(error.message || "") && error.code !== "23505") ({ error } = await supabase.from("job_drafts").insert({ ...row, id: key, costs: undefined }));
    if (error?.code === "23505") {
      // R19: only treat it as already sent if the existing row is really this worker's report.
      const { data: existing } = await supabase.from("job_drafts").select("id, worker_email").eq("id", key).maybeSingle();
      const mine = existing && String((existing as { worker_email?: string }).worker_email || "").toLowerCase() === String(row.worker_email || "").toLowerCase();
      return mine ? "" : "This report could not be matched to you. Discard it and send it again.";
    }
    return error ? error.message : "";
  }

  async function pickLineReceipt(id: string, file: File | undefined) {
    if (!file) return;
    try {
      const receipt = await compressImage(file);
      setCostLines((current) => current.map((line) => (line.id === id ? { ...line, receipt } : line)));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  // R121: crew can keep a report as a draft on this phone and send it later (receipts stay attached).
  const draftKey = `cr-crew-report-draft:${email}`;
  function saveReportDraft() {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ form, costLines }));
      setReportOpen(false);
      setMessage("Draft saved on this phone. Open Job report to finish and send it.");
    } catch { setMessage("Could not save the draft on this phone (no space)."); }
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!form.clientName.trim() || !ownerId) return setMessage("Add who the job was for.");
    if (!form.workDate) return setMessage("Add the date of the job."); // R111
    if (costLines.some((line) => !line.amount.trim() && (line.note.trim() || line.receipt))) return setMessage("Add the amount for each cost, or remove the empty line.");
    const costs: CostLine[] = costLines.filter((line) => line.amount.trim()).map(({ kind, amount, note, receipt }) => ({ kind, amount: amount.trim(), note: note.trim(), ...(receipt ? { receipt } : {}) }));
    const row = {
      owner_id: ownerId, employee_id: employeeId, worker_name: name, worker_email: email,
      client_name: form.clientName, client_phone: form.clientPhone, client_address: form.clientAddress,
      work_done: form.workDone, work_date: form.workDate, start_time: form.startTime, end_time: form.endTime,
      hours: form.hours || hoursBetween(form.startTime, form.endTime), ...legacySummary(costs), costs,
      drive_hours: form.driveHours, drive_minutes: form.driveMinutes, notes: form.notes, finished: form.finished,
      collected_amount: form.collectedAmount, collected_method: form.collectedMethod, status: "draft",
    };
    // R110: close at once and send behind it; if it fails the report comes back exactly as typed.
    const keptForm = form, keptLines = costLines;
    setBusy("report");
    setForm(empty); setCostLines([newCostLine()]); setReportOpen(false);
    setMessage("Sending job report…");
    const result = await sendOrQueue("report", "", row, (key) => insertReport(row, key));
    setBusy("");
    if (result.error) { setForm(keptForm); setCostLines(keptLines); setReportOpen(true); return setMessage(result.error); }
    if (result.queued) return setMessage("Saved on this phone. The job report will send when you're back online.");
    try { window.localStorage.removeItem(draftKey); } catch { /* none */ }
    setMessage("Job report sent. The owner will review it.");
    void load();
  }

  function jobCard(card: Card) { return jobCardView(card, false); }
  function jobCardView(card: Card, detail: boolean) {
    const status = (card.schedule_status || "scheduled") as JobStatus;
    const mine = clock.filter((entry) => entry.doc_id === card.doc_id);
    const running = mine.find((entry) => !entry.ended_at);
    const total = mine.reduce((sum, entry) => sum + entryHours(entry, now), 0);
    const jobSpend = expenses.filter((item) => item.doc_id === card.doc_id);
    const mapUrl = card.client_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.client_address)}` : "";
    const when = dayGroup(card.job_date, today);
    const past = when === "past";
    return (
      <article key={`${card.id}`} className={`${cardClass}${past ? " cr-card-past border-dashed opacity-70 saturate-50 transition hover:opacity-100 hover:saturate-100" : ""}${when === "today" ? " cr-card-today border-l-4 border-l-teal-500" : ""}`} data-testid={`crew-card-${card.doc_id}`} data-past={past ? "true" : "false"} data-today={when === "today" ? "true" : "false"} data-group={when} data-completed={status === "done" ? "true" : "false"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 dark:text-teal-300">
              {card.job_date ? dayLabel(card.job_date) : "No date yet"}
              {card.start_time ? ` · ${timeLabel(card.start_time)}${card.end_time ? `–${timeLabel(card.end_time)}` : ""}` : ""}
            </p>
            <h3 className="mt-0.5 truncate text-lg font-bold tracking-tight">{card.client_name || card.invoice_number || "Job"}</h3>
            {!detail && <a href={`/crew?job=${encodeURIComponent(card.doc_id)}`} data-testid={`crew-open-detail-${card.doc_id}`} className="cr-btn cr-btn-text -ml-2">Job details</a>}
          </div>
          {card.scheduled && <span data-testid={`job-state-${card.doc_id}`} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>{status === "done" ? (card.done_confirmed ? "Done · confirmed" : "Done · awaiting confirmation") : STATUS_LABEL[status]}</span>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm [&>*]:min-w-0 [&>*]:break-words">
          {card.client_phone
            ? <a href={`tel:${card.client_phone}`} className="flex min-h-11 items-center justify-center rounded-xl border border-teal-500/30 px-3 py-2 text-center font-medium transition hover:border-teal-400 hover:bg-teal-500/10" data-testid={`call-${card.doc_id}`} data-action="call"><span className="flex flex-col items-center leading-tight"><span className="inline-flex items-center gap-1.5"><Icon name="phone" />Call</span><span className="whitespace-nowrap text-xs font-normal tabular-nums opacity-80">{card.client_phone}</span></span></a>
            : <span className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-teal-500/20 px-3 py-2 text-center opacity-50">No phone</span>}
          {mapUrl
            ? <a href={mapUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border border-teal-500/30 px-3 py-2 text-center font-medium transition hover:border-teal-400 hover:bg-teal-500/10" data-testid={`map-${card.doc_id}`} data-action="map"><span className="inline-flex items-center gap-1.5"><Icon name="pin" />Map</span></a>
            : <span className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-teal-500/20 px-3 py-2 text-center opacity-50">No address</span>}
        </div>
        {card.client_address && <p className="mt-2 text-sm text-[var(--cr-muted)]">{card.client_address}</p>}
        {card.client_email && !card.client_phone && <p className="text-sm"><a className="tap underline" href={`mailto:${card.client_email}`}>{card.client_email}</a></p>}
        <CrewVisitNote docId={card.doc_id} />
        {(card.crewNote || card.payRow?.note) && (
          <p className="mt-2 rounded-xl bg-teal-500/10 px-3 py-2 text-sm flex items-start gap-2" data-testid="crew-note"><Icon name="note" className="mt-0.5 h-4 w-4 text-teal-700 dark:text-teal-300" /><span>{card.crewNote || card.payRow?.note}</span></p>
        )}

        {card.scheduled && card.items.length > 0 && (
          <fieldset className="mt-3 space-y-1 rounded-xl border border-teal-500/30 p-3 text-sm" data-testid={`crew-checklist-${card.doc_id}`}>
            <legend className="flex items-center gap-2 px-1 font-semibold">Checklist <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${checklistProgress(card.items).complete ? "cr-tone-good border-emerald-300 bg-emerald-50 text-emerald-800" : "cr-tone-warn border-amber-300 bg-amber-50 text-amber-900"}`}>{checklistProgress(card.items).done}/{card.items.length}</span></legend>
            {card.items.map((item) => (
              <label key={item.id} className="-mx-1 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 py-1 transition hover:bg-teal-500/5" data-testid="checklist-item" data-done={item.done ? "1" : "0"}>
                <input type="checkbox" className="h-6 w-6 shrink-0 cursor-pointer rounded accent-teal-600 disabled:cursor-not-allowed" checked={Boolean(item.done)} disabled={Boolean(card.done_confirmed)} onChange={(event) => tickItem(card, item.id, event.target.checked)} data-testid={`check-${item.id}`} />
                <span className={item.done ? "text-[var(--cr-muted)] line-through opacity-70" : ""}>{item.text}</span>
              </label>
            ))}
          </fieldset>
        )}
        {card.scheduled && (
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Job status">
            {(Object.keys(STATUS_LABEL) as JobStatus[]).map((key) => (
              <button key={key} type="button" aria-pressed={status === key} disabled={busy !== "" || Boolean(card.done_confirmed)} data-testid={`status-${key}-${card.doc_id}`}
                onClick={() => key === "done"
                  ? (setDoneFor(doneFor === card.doc_id ? "" : card.doc_id), setDonePhotos([]))
                  : act(`status-${card.doc_id}`, () => crewSetJobStatus(card.doc_id, key), `Marked ${STATUS_LABEL[key].toLowerCase()}.`)}
                className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition ${status === key ? `${STATUS_CLASS[key]} ring-2 ring-teal-400/60` : "border-teal-500/30 bg-[var(--cr-bg)] hover:border-teal-400 hover:bg-teal-500/10"} disabled:opacity-60`}>
                {STATUS_LABEL[key]}
              </button>
            ))}
          </div>
        )}
        {card.scheduled && status !== "done" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid={`omw-${card.doc_id}`} data-state={card.on_my_way_at ? "sent" : "none"}>
            <button type="button" disabled={busy !== ""} onClick={() => act(`omw-${card.doc_id}`, () => crewOnMyWay(card.doc_id), "Marked on my way. Your boss can see it.")} data-testid={`omw-button-${card.doc_id}`} className="min-h-11 rounded-xl border border-teal-500/30 px-3 py-2 font-semibold transition hover:border-teal-400 hover:bg-teal-500/10 disabled:opacity-60">
              <span className="inline-flex items-center gap-1.5"><Icon name="car" />{card.on_my_way_at ? `On my way · ${omwTime(card.on_my_way_at)}` : "On my way"}</span>
            </button>
            {card.on_my_way_at && card.client_phone && onMyWaySmsHref(card.client_phone, card.client_name, name) && (
              <a href={onMyWaySmsHref(card.client_phone, card.client_name, name)} data-testid={`omw-text-${card.doc_id}`} className="tap underline">Text the customer (you send it)</a>
            )}
          </div>
        )}
        {card.scheduled && doneFor === card.doc_id && !card.done_confirmed && (
          <div className="mt-3 space-y-2 rounded-xl border border-teal-500/30 p-3 text-sm" data-testid={`done-panel-${card.doc_id}`}>
            <p className="font-semibold">Photo of the finished job (required)</p>
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-teal-500/40 px-3 py-2 font-medium">
              <Icon name="camera" />{donePhotos.length ? "Add another photo" : "Take or choose photo"}
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" data-testid={`done-photo-input-${card.doc_id}`} onClick={nativePhotoClick((files) => pickDonePhotos(files))} onChange={(event) => { pickDonePhotos(event.target.files); event.target.value = ""; }} />
            </label>
            {donePhotos.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="done-photo-previews">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL previews */}
                {donePhotos.map((photo, index) => <img key={index} src={photo} alt={`Finished job photo ${index + 1}`} className="h-16 w-16 rounded-lg object-cover" />)}
              </div>
            )}
            <button type="button" disabled={busy !== "" || donePhotos.length === 0 || !checklistProgress(card.items).complete} onClick={() => markDone(card)} data-testid={`done-submit-${card.doc_id}`} className="min-h-11 w-full rounded-xl bg-teal-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">
              Mark done
            </button>
            {!checklistProgress(card.items).complete && <p className="cr-tone-warn inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900" data-testid="checklist-remaining">Tick every checklist item first ({card.items.length - checklistProgress(card.items).done} left).</p>}
            {donePhotos.length === 0 && <p className="text-xs text-[var(--cr-muted)]">Add at least one photo to mark the job done.</p>}
          </div>
        )}

        <div className="mt-3 rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Your time on this job</p>
              <p className="text-lg font-bold leading-tight tabular-nums" data-testid={`timer-${card.doc_id}`}>
                {running ? fmtTimer((now) - Date.parse(running.started_at)) : fmtHours(total)}
              </p>
              {running && <p className="text-xs text-[var(--cr-muted)]">Clocked in at {clockTime(running.started_at)} · {fmtHours(total)} total</p>}
            </div>
            {running ? (
              <button type="button" disabled={busy !== ""} data-testid={`clock-out-${card.doc_id}`} onClick={() => clockTap("clock-out", card.doc_id)} className="min-h-11 shrink-0 rounded-xl bg-amber-500 px-4 py-2 font-semibold text-slate-950!">Clock out</button>
            ) : past ? (
              <p data-testid={`past-state-${card.doc_id}`} data-completed={status === "done" ? "true" : "false"} className="shrink-0 rounded-full border border-slate-400/40 px-3 py-1.5 text-xs font-semibold text-[var(--cr-muted)]"><span className="inline-flex items-center gap-1">{status === "done" ? <><Icon name="check" className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />Completed</> : "Past job"}</span></p>
            ) : open && open.doc_id !== card.doc_id ? (
              <div className="shrink-0 text-right" data-testid={`on-other-job-${card.doc_id}`}>
                <p className="text-xs text-[var(--cr-muted)]" data-testid="on-other-job-label">On another job: {openLabel}</p>
                <button type="button" disabled={busy !== ""} data-testid={`clock-out-there-${open.doc_id}`} onClick={() => clockTap("clock-out", open.doc_id)} className="mt-1 min-h-11 rounded-xl border border-amber-500 px-3 py-2 text-sm font-semibold">Clock out there</button>
              </div>
            ) : (
              <button type="button" disabled={busy !== "" || Boolean(open)} data-testid={`clock-in-${card.doc_id}`} onClick={() => clockTap("clock-in", card.doc_id)} className="min-h-11 shrink-0 rounded-xl bg-teal-500 px-4 py-2 font-semibold text-slate-950! disabled:opacity-40">Clock in</button>
            )}
          </div>
          {mine.length > 0 && (
            <ul className="mt-3 divide-y divide-teal-500/10 border-t border-teal-500/10 text-sm">
              {mine.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid="clock-entry">
                  <span>{dayLabel(ymd(new Date(entry.started_at)))} · {clockTime(entry.started_at)} – {entry.ended_at ? clockTime(entry.ended_at) : "now"}{entry.edited_reason ? ` · edited: ${entry.edited_reason}` : ""}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{fmtHours(entryHours(entry, now))}</span>
                    {entry.id.startsWith("pending-") ? <span className="text-xs text-[var(--cr-muted)]" data-testid="clock-pending">Not sent yet</span> : <button type="button" data-testid="clock-fix-time" className="inline-flex min-h-11 min-w-11 items-center rounded-lg border border-teal-600/40 px-3 text-sm font-medium text-teal-700 dark:text-teal-300" onClick={() => setFixing({ id: entry.id, start: localInput(entry.started_at), end: localInput(entry.ended_at || new Date().toISOString()), reason: "" })}>Fix time</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {fixing && mine.some((entry) => entry.id === fixing.id) && (
            <div className="mt-3 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p className="text-xs">Forgot to clock in or out? Set the real times and say why. Your boss sees the reason.</p>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 [&>*]:min-w-0">
                <label className="space-y-1 text-xs font-medium">Start<input type="datetime-local" className={input} value={fixing.start} onChange={(event) => setFixing({ ...fixing, start: event.target.value })} /></label>
                <label className="space-y-1 text-xs font-medium">End<input type="datetime-local" className={input} value={fixing.end} onChange={(event) => setFixing({ ...fixing, end: event.target.value })} /></label>
              </div>
              <input className={input} placeholder="Reason, e.g. forgot to clock out" value={fixing.reason} onChange={(event) => setFixing({ ...fixing, reason: event.target.value })} aria-label="Reason" />
              <div className="flex gap-2">
                <button type="button" onClick={saveFix} className="flex-1 rounded-xl bg-teal-500 px-3 py-2.5 font-semibold text-slate-950! transition hover:bg-teal-400 sm:flex-none">Save time</button>
                <button type="button" onClick={() => setFixing(null)} className="flex-1 rounded-xl border border-teal-500/30 px-3 py-2.5 font-medium transition hover:border-teal-400 sm:flex-none">Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2">
          {spendOpen === card.doc_id ? (
            <div className="space-y-3 border-t border-teal-500/20 pt-3" data-testid={`expense-form-${card.doc_id}`}>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Category" className={input} value={spend.kind} onChange={(event) => setSpend({ ...spend, kind: event.target.value })}>
                  {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input aria-label="Amount" inputMode="decimal" className={input} placeholder="Amount $" value={spend.amount} onChange={(event) => setSpend({ ...spend, amount: event.target.value })} />
              </div>
              <input aria-label="What it was" className={input} placeholder="What it was" value={spend.note} onChange={(event) => setSpend({ ...spend, note: event.target.value })} />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-teal-500/50 px-3 py-3 text-sm font-medium transition hover:bg-teal-500/10">
                <Icon name="camera" />{spend.receipt ? "Retake receipt photo" : "Snap receipt"}
                <input aria-label="Receipt photo" type="file" accept="image/*" capture="environment" className="sr-only" onClick={nativePhotoClick((files) => pickReceipt(files[0]))} onChange={(event) => pickReceipt(event.target.files?.[0])} />
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              {spend.receipt && <img src={spend.receipt} alt="Receipt preview" className="max-h-40 rounded-lg" data-testid="receipt-preview" />}
              <div className="flex gap-2">
                <button type="button" disabled={busy !== ""} onClick={() => saveExpense(card)} className="min-h-11 flex-1 rounded-xl bg-teal-500 px-3 py-2.5 font-semibold text-slate-950! transition hover:bg-teal-400 disabled:opacity-60">Save expense</button>
                <button type="button" onClick={() => setSpendOpen("")} className="min-h-11 min-w-24 rounded-xl border border-teal-700/40 px-4 py-2.5 font-medium transition hover:border-teal-400 hover:bg-teal-500/10 dark:border-teal-500/40">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
            <button type="button" data-testid={`add-expense-${card.doc_id}`} onClick={() => { setSpend({ kind: "parts", amount: "", note: "", receipt: "" }); setSpendOpen(card.doc_id); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-teal-800 transition hover:bg-teal-500/10 dark:text-teal-300">
              <Icon name="receipt" />Add expense / receipt
            </button>
            <label data-testid={`snap-receipt-${card.doc_id}`} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-500/50 px-4 text-sm font-semibold text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 focus-within:ring-2 focus-within:ring-teal-400 dark:text-teal-300">
              <Icon name="camera" />Snap receipt
              <input aria-label="Snap receipt for this job" type="file" accept="image/*" capture="environment" className="sr-only" data-testid={`snap-receipt-input-${card.doc_id}`} onClick={nativePhotoClick((files) => snapReceipt(card.doc_id, files[0]))} onChange={(event) => { void snapReceipt(card.doc_id, event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            <label data-testid={`job-photo-${card.doc_id}`} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-teal-500/50 px-4 text-sm font-semibold text-teal-700 transition hover:border-teal-400 hover:bg-teal-500/10 dark:text-teal-300">
              <Icon name="camera" />Job photo
              <input aria-label="Add a job photo" type="file" accept="image/*" capture="environment" className="sr-only" data-testid={`job-photo-input-${card.doc_id}`} onClick={nativePhotoClick((files) => addJobPhoto(card.doc_id, files[0]))} onChange={(event) => { void addJobPhoto(card.doc_id, event.target.files?.[0]); event.target.value = ""; }} />
            </label>
            </div>
          )}
          {jobSpend.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-[var(--cr-muted)]">
              {jobSpend.map((item) => (
                <li key={item.id} data-testid="expense-item">{KINDS.find(([value]) => value === item.kind)?.[1] || item.kind} · ${item.amount}{item.note ? ` · ${item.note}` : ""}{item.receipt ? " · receipt attached" : ""}</li>
              ))}
            </ul>
          )}
        </div>

        {card.payRow && !detail && (
          <p className="mt-3 text-xs text-[var(--cr-muted)]">
            {card.payRow.hours ? `${card.payRow.hours} hrs on your pay sheet · ` : ""}
            {card.payRow.status === "paid" ? `Your pay $${Number(card.payRow.pay || 0).toFixed(2)}` : "Pay not confirmed yet"}
          </p>
        )}
      </article>
    );
  }

  const tabs: [Tab, string][] = [["today", "Today"], ["week", "This week"], ["hours", "My hours"], ["reports", "Reports"]];

  return (
    <main className="crew-page min-h-dvh bg-[var(--cr-bg)] pb-24 text-[var(--cr-text)]">
      <header className="app-topbar sticky top-0 z-10 border-b border-teal-500/20 bg-[var(--cr-bg)] px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500 font-bold text-slate-950! shadow-sm">C</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight" data-testid="crew-name">{name || "Your jobs"}</p>
              <p className="text-xs text-[var(--cr-muted)]">Crew</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1 text-sm sm:gap-3">
            {open && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200 tabular-nums" data-testid="header-timer"><Icon name="timer" className="h-3.5 w-3.5" />{fmtTimer((now) - Date.parse(open.started_at))}</span>}
            <button type="button" onClick={switchTheme} className="tap inline-flex min-h-11 w-16 items-center justify-center rounded-lg px-2.5 py-2 font-medium sm:px-3 transition hover:bg-teal-500/10">{theme === "dark" ? "Light" : "Dark"}</button>
            <button type="button" className="tap inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2.5 py-2 font-medium sm:px-3 transition hover:bg-teal-500/10" onClick={async () => { if (!(await confirmLogoutWithQueue(userId))) return; await supabase.auth.signOut(); window.location.href = "/"; }}>Log out</button>
          </div>
        </div>
        <nav className="mx-auto mt-3 grid max-w-3xl grid-cols-4 gap-1 rounded-xl border border-teal-700/30 bg-[var(--cr-card)] dark:border-teal-500/20 p-1 text-xs sm:text-sm" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); window.scrollTo({ top: 0 }); }} className={`crew-tab min-h-11 rounded-lg px-1 py-2 font-medium leading-tight transition ${tab === key ? "crew-tab-active bg-teal-500 font-semibold text-slate-950! shadow-sm" : "crew-tab-idle bg-transparent hover:bg-teal-500/10"}`}>{label}</button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        {message && <p className="rounded-xl border border-teal-500/30 px-3 py-2 text-sm" role="status" data-testid="crew-message">{message}</p>}
        <FormDraft form="crew-fix-time" value={fixing || { id: "", start: "", end: "", reason: "" }} blank={{ id: "", start: "", end: "", reason: "" }} onRestore={(v) => { setFixing(v); setTab("hours"); }} what="time fix" />
        {/* Backlog 7: one clear sync status for the phone: offline or not, and how much is still on this phone. */}
        {((offlineFlag: boolean) => {
          // The browser's own signal too, so a tap made after losing signal never shows "Send now".
          const offline = offlineFlag || (mounted && navigator.onLine === false);
          const waiting = queue.filter((item) => !item.lastError).length;
          // Clock taps, checklist ticks, photos, expenses and reports all wait in the same phone queue.
          // R41: refused items still count as waiting (they are on this phone) until sent or discarded.
          const onPhone = queue.length;
          if (!offline && !queue.length) return null;
          const state = offline ? "offline" : onPhone ? "waiting" : "failed";
          const statusLine = offline || onPhone > 0 ? (
                <p className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${offline ? "cr-dot-warn bg-amber-500" : "bg-teal-500"}`} />
                  {offline
                    ? <span data-testid="crew-offline"><strong className="font-semibold">Offline.</strong> Showing what was saved on this phone.{onPhone > 0 ? ` ${onPhone} item${onPhone === 1 ? "" : "s"} saved here will send when you're back online.` : " Anything you add will send when you're back online."}</span>
                    : <span className="font-semibold" data-testid="crew-sync-waiting">{onPhone} waiting to send</span>}
                  {!offline && waiting > 0 && <button type="button" className="ml-auto inline-flex min-h-11 min-w-11 items-center rounded-lg bg-teal-600 px-4 font-semibold text-white hover:bg-teal-500" data-testid="crew-queue-retry" onClick={() => flush()}>Send now</button>}
                </p>
              ) : null;
          return (
            <div role="status" data-testid="crew-sync" data-state={state} data-waiting={onPhone} className={`space-y-2 rounded-xl border p-3 text-sm sm:p-4 ${state === "offline" ? "cr-tone-warn border-amber-500/40 bg-amber-50 text-amber-900" : state === "failed" ? "cr-tone-bad border-rose-300 bg-rose-50 text-rose-800" : "cr-tone-teal border-teal-400/50 bg-teal-50 text-teal-900"}`}>
              {!queue.length && statusLine}
              {queue.length > 0 && (
                <div className="space-y-2" data-testid="crew-queue" data-count={waiting}>
                {statusLine}
            {queue.filter((item) => item.lastError).map((item) => (
              <p key={item.id} className="cr-tone-bad flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800" data-testid="crew-queue-failed" data-doc-id={item.docId}>
                <span className="min-w-0 flex-1 basis-48">{item.kind === "done" ? "Done photos" : item.kind === "report" ? "Job report" : "Expense"} for {cards.find((card) => card.doc_id === item.docId)?.client_name || "a job"} couldn&apos;t be sent: {item.lastError}</span>
                <button type="button" className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-teal-600 px-4 font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50" data-testid="crew-queue-item-retry" disabled={offline} onClick={() => retryQueued(item).then(() => { refreshQueue(); flush(); })}>Retry</button>
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center rounded-lg border border-rose-400/60 px-4 font-semibold" data-testid="crew-queue-discard" onClick={() => removeQueued(item.id).then(() => refreshQueue())}>Discard</button>
              </p>
            ))}
                </div>
              )}
            </div>
          );
        })(offline)}

        {detailId && (() => {
          const card = cards.find((item) => item.doc_id === detailId);
          if (!card) return <p className={cardClass} data-testid="crew-detail-missing">This job is not on your list. <a href="/crew" className="underline">Back to my jobs</a></p>;
          const running = clock.find((entry) => entry.doc_id === card.doc_id && !entry.ended_at);
          const otherOpen = clock.find((entry) => entry.doc_id !== card.doc_id && !entry.ended_at);
          const phone = String(card.client_phone || "").replace(/[^0-9+]/g, "");
          const mapUrl = card.client_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.client_address)}` : "";
          return (
            <section className="space-y-3" data-testid="crew-detail" data-doc-id={card.doc_id}>
              <a href="/crew" data-testid="crew-detail-back" className="cr-btn cr-btn-text">‹ My jobs</a>
              <div className={cardClass}>
                <h2 className="text-xl font-bold tracking-tight">{card.client_name || "Job"}</h2>
                <p className="text-sm text-[var(--cr-muted)]">{card.job_date ? dayLabel(card.job_date) : "No date yet"}{card.start_time ? ` · ${timeLabel(card.start_time)}${card.end_time ? `–${timeLabel(card.end_time)}` : ""}` : ""}</p>
                {card.client_address && <p className="mt-1 text-sm">{card.client_address}</p>}
                {running
                  ? <button type="button" disabled={busy !== ""} data-testid="crew-detail-clock-out" onClick={() => clockTap("clock-out", card.doc_id)} className="cr-btn mt-3 w-full bg-amber-500 py-4 text-lg text-slate-950!" style={{ minHeight: "3.75rem" }}>Clock out</button>
                  : <button type="button" disabled={busy !== "" || Boolean(otherOpen) || Boolean(card.done_confirmed)} data-testid="crew-detail-start" onClick={() => clockTap("clock-in", card.doc_id)} className="cr-btn cr-btn-primary mt-3 w-full py-4 text-lg" style={{ minHeight: "3.75rem" }}>Start · Clock in</button>}
                {otherOpen && !running && <p className="mt-1 text-xs text-[var(--cr-muted)]" data-testid="crew-detail-other-open">Clock out of your other job first.</p>}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" data-testid="crew-detail-map" className="cr-btn cr-btn-secondary">Map</a> : <span className="cr-btn cr-btn-secondary opacity-50" aria-disabled="true">Map</span>}
                  {phone ? <a href={`tel:${phone}`} data-testid="crew-detail-call" className="cr-btn cr-btn-secondary">Call</a> : <span className="cr-btn cr-btn-secondary opacity-50" aria-disabled="true">Call</span>}
                  {phone ? <a href={`sms:${phone}`} data-testid="crew-detail-text" className="cr-btn cr-btn-secondary">Text</a> : <span className="cr-btn cr-btn-secondary opacity-50" aria-disabled="true">Text</span>}
                </div>
              </div>
              {jobCardView(card, true)}
            </section>
          );
        })()}
        {!detailId && tab === "today" && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">{today ? dayLabel(today) : "Today"}</h2>
            {todayCards.length === 0 && <EmptyState icon={<Icon name="sun" className="h-6 w-6" />} title="Nothing scheduled for you today." className={`${cardClass} border-dashed`} />}
            {(() => {
              const route = routeStops(todayCards);
              if (route.stops.length < 2) return null;
              return (
                <div className={cardClass} data-testid="crew-route">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Today&apos;s route</h3>
                    <a href={route.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400" data-testid="crew-route-open">Open route in Maps</a>
                  </div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                    {route.stops.map((card) => <li key={card.id} data-testid={`crew-route-stop-${card.id}`}>{card.start_time ? `${timeLabel(card.start_time)} · ` : ""}{card.client_name} — {card.client_address}</li>)}
                  </ol>
                </div>
              );
            })()}
            {todayCards.map(jobCard)}
            {(() => {
              const next = nextJob(cards, today);
              const recent = recentJobs(cards, today);
              return (
                <>
                  <div className={cardClass} data-testid="crew-next-job" data-doc-id={next?.doc_id || ""}>
                    <h3 className="font-semibold">Next job</h3>
                    {next ? (
                      <a href={`/crew?job=${encodeURIComponent(next.doc_id)}`} data-testid="crew-next-open" className="mt-1 flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm">
                        <span>{dayLabel(next.job_date)}{next.start_time ? ` · ${timeLabel(next.start_time)}` : ""} · {next.client_name}</span>
                        <span className="cr-btn cr-btn-secondary">Open</span>
                      </a>
                    ) : <p className="mt-1 text-sm text-[var(--cr-muted)]" data-testid="crew-next-none">No upcoming jobs.</p>}
                  </div>
                  <div className={cardClass} data-testid="crew-recent-jobs" data-count={recent.length}>
                    <h3 className="font-semibold">Recent jobs</h3>
                    {recent.length === 0 ? <p className="mt-1 text-sm text-[var(--cr-muted)]">No recent jobs yet.</p> : (
                      <ul className="mt-1 divide-y divide-teal-500/10 text-sm">
                        {recent.map((row) => <li key={row.id} data-testid="crew-recent-job" data-doc-id={row.doc_id}><a href={`/crew?job=${encodeURIComponent(row.doc_id)}`} className="flex min-h-11 items-center justify-between gap-2"><span>{dayLabel(row.job_date)} · {row.client_name}</span><span className="text-xs text-[var(--cr-muted)]">{STATUS_LABEL[(row.schedule_status || "scheduled") as JobStatus] || ""}</span></a></li>)}
                      </ul>
                    )}
                  </div>
                </>
              );
            })()}
          </section>
        )}

        {!detailId && tab === "week" && (
          <section className="space-y-4">
            {weekDays.map((day) => {
              const list = weekCards.filter((card) => card.job_date === day);
              if (!list.length) return null;
              return (
                <div key={day} className="space-y-2" data-testid="week-day" data-day={day} data-group={dayGroup(day, today)}>
                  <h2 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${day === today ? "text-teal-700 dark:text-teal-300" : "text-[var(--cr-muted)]"}`}>{day === today && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-teal-500" />}{dayLabel(day)}{day === today && <span className="cr-tone-teal rounded-full border border-teal-500/40 bg-teal-50 px-2 py-0.5 text-[10px] text-teal-800">Today</span>}{dayGroup(day, today) === "past" && <span className="font-normal normal-case tracking-normal opacity-75">· Past</span>}<span aria-hidden="true" className="h-px flex-1 bg-teal-500/15" /></h2>
                  {list.map(jobCard)}
                </div>
              );
            })}
            {weekCards.length === 0 && <EmptyState icon={<Icon name="sun" className="h-6 w-6" />} title="No jobs for you this week." className={`${cardClass} border-dashed`} />}
            {later.length > 0 && (
              <div className="space-y-2" data-testid="coming-up" data-group="upcoming">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Coming up<span aria-hidden="true" className="h-px flex-1 bg-teal-500/15" /></h2>
                {later.map(jobCard)}
              </div>
            )}
            <details className="space-y-2" data-testid="crew-recent" data-count={recent.length}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)] [&::-webkit-details-marker]:hidden">Recent jobs (last 2 weeks)<span className="tabular-nums">{recent.length}</span><span aria-hidden="true" className="h-px flex-1 bg-teal-500/15" /></summary>
              {recent.length === 0 && <p className="rounded-xl border border-dashed border-teal-500/25 px-4 py-6 text-center text-sm text-[var(--cr-muted)]">No jobs in the last two weeks.</p>}
              <ul className="divide-y divide-teal-500/10">
                {recent.map((card) => (
                  <li key={`recent-${card.id}`} data-testid="crew-recent-job" data-date={card.job_date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-xs font-semibold uppercase text-[var(--cr-muted)]" data-testid="crew-recent-week">{card.job_date >= lastWeekStart ? "Last week" : "Earlier"}</span>
                      <span className="block font-medium">{dayLabel(card.job_date)}{card.start_time ? ` · ${card.start_time}` : ""}</span>
                      <span className="block truncate text-[var(--cr-muted)]">{card.client_name || "Job"}{card.invoice_number ? ` · ${card.invoice_number}` : ""}{card.client_address ? ` · ${card.client_address}` : ""}</span>
                    </span>
                    <span className="shrink-0 rounded-full border border-teal-500/30 px-2 py-0.5 text-xs" data-testid="crew-recent-status">{card.schedule_status === "done" ? "Done" : card.schedule_status === "in_progress" ? "In progress" : "Scheduled"}</span>
                  </li>
                ))}
              </ul>
            </details>
            {undated.length > 0 && (
              <div className="space-y-2">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Not scheduled yet<span aria-hidden="true" className="h-px flex-1 bg-teal-500/15" /></h2>
                {undated.map(jobCard)}
              </div>
            )}
          </section>
        )}

        {!detailId && tab === "hours" && (
          <section className={cardClass} data-testid="my-hours">
            <h2 className="text-lg font-bold tracking-tight">My hours this week</h2>
            <p className="text-xs text-[var(--cr-muted)]">Clocked is from your clock in/out. Pay sheet is what your boss logged for pay.</p>
            <table className="mt-4 w-full table-fixed text-sm"><colgroup><col /><col className="w-24" /><col className="w-24" /></colgroup>
              <thead><tr className="text-left text-xs uppercase tracking-wide text-[var(--cr-muted)]"><th className="px-2 py-2 font-semibold">Day</th><th className="px-2 py-2 text-right font-semibold">Clocked</th><th className="px-2 py-2 text-right font-semibold">Pay sheet</th></tr></thead>
              <tbody>
                {hoursByDay.map((item) => (
                  <tr key={item.day} className={`border-t border-teal-500/10 ${item.day === today ? "cr-hours-today bg-teal-500/10 font-semibold" : ""}`} data-testid={`hours-${item.day}`}>
                    <td className="px-2 py-2">{dayLabel(item.day)}{item.day === today && <span className="ml-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">Today</span>}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{item.clocked ? fmtHours(item.clocked) : "–"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{item.logged ? `${item.logged.toFixed(2)} h` : "–"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-teal-500/30 font-semibold" data-testid="hours-total"><td className="px-2 py-2">Total</td><td className="px-2 py-2 text-right tabular-nums">{fmtHours(weekClocked)}</td><td className="px-2 py-2 text-right tabular-nums">{weekLogged.toFixed(2)} h</td></tr>
              </tfoot>
            </table>
            <div className="mt-5 rounded-xl bg-teal-500/10 p-4 text-sm">
              <p className="text-xs text-[var(--cr-muted)]">Your confirmed pay (jobs marked paid)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">${confirmedPay.toFixed(2)}</p>
              <p className="text-xs text-[var(--cr-muted)]">Only you can see this. A scheduled job is not pay yet.</p>
            </div>
          </section>
        )}

        {!detailId && tab === "hours" && <CrewDaysOff />}

        {!detailId && tab === "reports" && (
          <section className="space-y-3">
            <button type="button" data-testid="report-open" onClick={() => { if (!reportOpen) { try { const kept = JSON.parse(window.localStorage.getItem(draftKey) || "null"); if (kept?.form) { setForm(kept.form); if (Array.isArray(kept.costLines) && kept.costLines.length) setCostLines(kept.costLines); setMessage("Your saved draft is back. Send it when ready."); } } catch { /* none */ } } if (!reportOpen && !form.workDate) { const d = new Date(); setForm((f) => ({ ...f, workDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` })); } setReportOpen(!reportOpen); }} className={`min-h-11 w-full rounded-xl px-4 py-3 font-semibold transition ${reportOpen ? "border border-teal-700/40 hover:bg-teal-500/10 dark:border-teal-500/40" : "bg-teal-500 text-slate-950! shadow-sm hover:bg-teal-400"}`}>{reportOpen ? "Close" : "New job report"}</button>
            {reportOpen && (
              <form onSubmit={saveDraft} className={`${cardClass} space-y-3`}>
                <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Client</span><select id="report-savedClient" name="savedClient" aria-label="Saved client" className={input} onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); if (client) setForm({ ...form, clientName: client.name, clientPhone: client.phone || "", clientAddress: client.address || "" }); }}>
                  <option value="">Pick a client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select></label>
                <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Name</span><input id="report-clientName" name="clientName" className={input} placeholder="Who it was for" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} /></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Phone</span><input id="report-clientPhone" inputMode="tel" name="clientPhone" className={input} placeholder="Phone" value={form.clientPhone} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} /></label>
                <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Address</span><input id="report-clientAddress" name="clientAddress" className={input} placeholder="Address" value={form.clientAddress} onChange={(event) => setForm({ ...form, clientAddress: event.target.value })} /></label></div>
                <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Work done</span><textarea id="report-workDone" name="workDone" className={`${input} min-h-20`} placeholder="What was done" value={form.workDone} onChange={(event) => setForm({ ...form, workDone: event.target.value })} /></label>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Date *</span><input id="report-workDate" name="workDate" required aria-required="true" type="date" className={input} value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /></label>
                  <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Hours</span><input id="report-hours" name="hours" className={input} value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
                  <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Start</span><input id="report-startTime" name="startTime" type="time" className={input} value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
                  <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">End</span><input id="report-endTime" name="endTime" type="time" className={input} value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
                </div>
                <fieldset className="owner-costs space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-slate-900" data-testid="report-costs">
                  <legend className="rounded-md px-1 text-sm font-medium">Costs you paid</legend>
                  {costLines.map((line, index) => (
                    <div key={line.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5" data-testid="report-cost-line">
                      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                        <select aria-label={`Cost ${index + 1} category`} data-testid="report-cost-kind" id={`report-cost-${index}-kind`} name={`costs[${index}].kind`} className={`${input} bg-white`} value={line.kind} onChange={(event) => setCostLines((current) => current.map((item) => (item.id === line.id ? { ...item, kind: event.target.value as CrewKind } : item)))}>
                          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <input aria-label={`Cost ${index + 1} amount`} data-testid="report-cost-amount" id={`report-cost-${index}-amount`} name={`costs[${index}].amount`} inputMode="decimal" className={`${input} bg-white text-right tabular-nums`} placeholder="Amount $" value={line.amount} onChange={(event) => setCostLines((current) => current.map((item) => (item.id === line.id ? { ...item, amount: event.target.value } : item)))} />
                      </div>
                      <input aria-label={`Cost ${index + 1} note`} data-testid="report-cost-note" id={`report-cost-${index}-note`} name={`costs[${index}].note`} className={`${input} bg-white`} placeholder="What it was" value={line.note} onChange={(event) => setCostLines((current) => current.map((item) => (item.id === line.id ? { ...item, note: event.target.value } : item)))} />
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-400 px-3 text-sm font-medium transition hover:border-teal-500 hover:bg-teal-500/10">
                          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>{line.receipt ? "Retake receipt" : "Receipt photo (optional)"}
                          <input aria-label={`Cost ${index + 1} receipt photo`} data-testid="report-cost-receipt" id={`report-cost-${index}-receipt`} name={`costs[${index}].receipt`} type="file" accept="image/*" capture="environment" className="sr-only" onClick={nativePhotoClick((files) => pickLineReceipt(line.id, files[0]))} onChange={(event) => { pickLineReceipt(line.id, event.target.files?.[0]); event.target.value = ""; }} />
                        </label>
                        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                        {line.receipt && <img src={line.receipt} alt={`Receipt ${index + 1}`} className="h-11 w-11 rounded-lg object-cover" data-testid="report-cost-receipt-preview" />}
                        {costLines.length > 1 && <button type="button" data-testid="report-cost-remove" className="ml-auto min-h-11 rounded-lg border border-rose-500/40 px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300" onClick={() => setCostLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button>}
                      </div>
                    </div>
                  ))}
                  {costLines.length < 20 && <button type="button" data-testid="report-cost-add" className="min-h-11 w-full rounded-lg bg-teal-500 px-3 text-sm font-semibold text-slate-950! transition hover:bg-teal-400" onClick={() => setCostLines((current) => [...current, newCostLine()])}>＋ Add another cost</button>}
                </fieldset>
                <label className="block space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Notes</span><textarea id="report-notes" name="notes" className={`${input} min-h-16`} placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-teal-700/30 px-3 py-2 text-sm font-medium dark:border-teal-500/20"><input id="report-finished" name="finished" className="h-6 w-6 accent-teal-600" type="checkbox" checked={form.finished} onChange={(event) => setForm({ ...form, finished: event.target.checked })} /> Job is finished</label>
                <button type="submit" data-testid="report-submit" disabled={busy !== ""} className="mt-2 min-h-12 w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950! shadow-lg transition hover:bg-teal-400">Send job report</button>
                <button type="button" data-testid="report-save-draft" onClick={saveReportDraft} className="mt-2 min-h-11 w-full rounded-xl border border-teal-500/40 px-4 py-2.5 font-medium">Save as draft (not sent)</button>
              </form>
            )}
            <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Reports you sent</h2>
            {drafts.length === 0 && <p className="rounded-2xl border border-dashed border-teal-500/30 p-6 text-center text-sm text-[var(--cr-muted)]">None yet.</p>}
            {drafts.map((draft) => (
              <div key={draft.id} className={cardClass}>
                <p className="font-medium">{draft.client_name}</p>
                <p className="text-sm text-[var(--cr-muted)]">{draft.work_date || "No date"} · {draft.hours || "0"} hrs · waiting on owner</p>
                <p className="mt-1 text-sm">{draft.work_done}</p>
              </div>
            ))}
          </section>
        )}
        {userId && <p className="pt-4 text-center text-xs text-[var(--cr-muted)]">You only see your own jobs, time and expenses. Prices and company costs are not shown.</p>}
        <footer className="crew-account mt-10 border-t border-teal-500/15 pt-4 pb-6" aria-label="Profile">
          <details className="cr-collapse" data-testid="crew-profile">
            <summary>Profile</summary>
            <div className="px-4 pb-3 text-sm">
              <p data-testid="crew-profile-name">{name}</p>
              <div className="mt-3 flex justify-center border-t border-teal-500/15 pt-3"><a href="/account/delete" className="crew-delete-link tap inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 py-2 text-xs text-rose-700/80 underline-offset-2 transition hover:bg-rose-500/10 hover:underline dark:text-rose-300" data-testid="crew-delete-account">Delete my account</a></div>
            </div>
          </details>
        </footer>
      </div>
    </main>
  );
}
