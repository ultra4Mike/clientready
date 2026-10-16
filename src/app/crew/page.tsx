"use client";

import { nativePhotoClick } from "@/lib/native-camera";
import { enqueue, flushQueue, isNetworkError, queued, removeQueued, type QueueItem, type QueueKind } from "@/lib/photo-queue";
import EmptyState from "@/components/EmptyState";
import CrewDaysOff from "@/components/CrewDaysOff";
import { CREW_KINDS } from "@/lib/cost-categories";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { crewMarkDone, crewOnMyWay, omwTime, crewSetJobStatus, onMyWaySmsHref, STATUS_CLASS, STATUS_LABEL, type JobStatus } from "@/lib/schedule";
import { compressPhoto } from "@/lib/photos";
import { compressImage, crewClockIn, crewClockOut, crewEditClock, entryHours, fmtHours, fmtTimer, type ClockEntry } from "@/lib/clock";

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
};
type Card = Job & { scheduled: boolean; crewNote: string; payRow?: Job };
type Expense = { id: string; doc_id: string; kind: string; amount: string; note: string; receipt?: string; created_at?: string };
type Draft = { id: string; client_name: string; work_date: string; hours: string; work_done: string; status: string };
type Tab = "today" | "week" | "hours" | "reports";
type Cache = { name: string; jobs: Job[]; clock: ClockEntry[]; expenses: Expense[]; drafts: Draft[] };

const empty = {
  clientName: "", clientPhone: "", clientAddress: "", workDone: "", workDate: "",
  startTime: "", endTime: "", hours: "", partsCost: "", partsNote: "",
  driveHours: "", driveMinutes: "", notes: "", finished: false, collectedAmount: "", collectedMethod: "cash",
};
// Same names as the owner's "Crew spend vs your estimate" rows.
const KINDS = CREW_KINDS.map(({ kind, label }) => [kind, label] as const);
const input = "w-full rounded-xl border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";
const cardClass = "rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm sm:p-5";

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
function buildCards(jobs: Job[]): Card[] {
  const cards: Card[] = [];
  for (const job of jobs) {
    if (job.id.includes("-sched-")) continue;
    if (cards.some((card) => card.doc_id === job.doc_id)) {
      // A second pay row on the same job (another day): keep it as its own card.
      cards.push({ ...job, scheduled: false, crewNote: "", payRow: job });
      continue;
    }
    cards.push({ ...job, scheduled: false, crewNote: "", payRow: job });
  }
  for (const sched of jobs.filter((job) => job.id.includes("-sched-"))) {
    const index = cards.findIndex((card) => card.doc_id === sched.doc_id && !card.scheduled);
    const merged = {
      scheduled: true, schedule_status: sched.schedule_status, done_confirmed: Boolean(sched.done_confirmed), job_date: sched.job_date || "", start_time: sched.start_time,
      end_time: sched.end_time, client_email: sched.client_email, crewNote: sched.note || "", on_my_way_at: sched.on_my_way_at || "",
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
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clock, setClock] = useState<ClockEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [now, setNow] = useState(0);
  const [today, setToday] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [theme, setTheme] = useState("dark");
  const [form, setForm] = useState(empty);
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
    const [employee, clientRows, jobRows, clockRows, spendRows, draftRows] = await Promise.all([
      supabase.from("employees").select("name").ilike("email", user.email || "").maybeSingle(),
      supabase.rpc("list_crew_clients"),
      supabase.from("crew_jobs").select("*").order("job_date", { ascending: true }),
      supabase.from("crew_clock").select("*").order("started_at", { ascending: true }),
      supabase.from("crew_expenses").select("*").order("created_at", { ascending: false }),
      supabase.from("job_drafts").select("*").order("created_at", { ascending: false }),
    ]);
    // The database already limits crew to their own rows. An owner who is also on their own crew
    // list can read all of their workers' rows (owner access), so keep only this person's rows here.
    const next: Cache = {
      name: employee.data?.name || user.email || "",
      jobs: ((jobRows.data || []) as Job[]).filter(ownRow),
      clock: ((clockRows.data || []) as ClockEntry[]).filter(ownRow),
      expenses: ((spendRows.data || []) as Expense[]).filter(ownRow),
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
    const gone = () => setOffline(true);
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    return () => { window.clearInterval(timer); window.clearTimeout(first); window.clearTimeout(start); window.removeEventListener("online", back); window.removeEventListener("offline", gone); };
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
    if (item.kind === "done") return crewMarkDone(item.docId, (item.payload.photos as string[]) || []);
    const { error } = await supabase.rpc("crew_add_expense", { p_doc_id: item.docId, ...item.payload });
    return error ? error.message : "";
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
  async function sendOrQueue(kind: QueueKind, docId: string, payload: Record<string, unknown>, send: () => Promise<string>) {
    const error = navigator.onLine ? await send().catch((reason: unknown) => String((reason as Error)?.message || reason)) : "offline";
    if (!error || !isNetworkError(error === "offline" ? "failed to fetch" : error)) return { error, queued: false };
    try {
      await enqueue({ user: userId, kind, docId, payload });
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

  const cards = useMemo(() => buildCards(jobs), [jobs]);
  const open = clock.find((entry) => !entry.ended_at);
  const weekStart = today ? addDays(today, -new Date(`${today}T00:00:00`).getDay()) : "";
  const weekDays = weekStart ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)) : [];
  const todayCards = cards.filter((card) => card.job_date === today);
  const weekCards = cards.filter((card) => weekDays.includes(card.job_date));
  const undated = cards.filter((card) => !card.job_date);
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
      const result = await sendOrQueue("expense", card.doc_id, payload, async () => {
        const { error } = await supabase.rpc("crew_add_expense", { p_doc_id: card.doc_id, ...payload });
        return error ? error.message : "";
      });
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

  async function markDone(card: Card) {
    await act(`status-${card.doc_id}`, async () => {
      const result = await sendOrQueue("done", card.doc_id, { photos: donePhotos }, () => crewMarkDone(card.doc_id, donePhotos));
      if (!result.error) { setDonePhotos([]); setDoneFor(""); }
      return result.error;
    }, navigator.onLine ? "Marked done. Your boss will confirm it." : "Saved on this phone with the photos. It will send when you're back online.");
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

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (!form.clientName.trim() || !ownerId) return setMessage("Add who the job was for.");
    const { error } = await supabase.from("job_drafts").insert({
      id: Date.now().toString(), owner_id: ownerId, employee_id: employeeId, worker_name: name, worker_email: email,
      client_name: form.clientName, client_phone: form.clientPhone, client_address: form.clientAddress,
      work_done: form.workDone, work_date: form.workDate, start_time: form.startTime, end_time: form.endTime,
      hours: form.hours || hoursBetween(form.startTime, form.endTime), parts_cost: form.partsCost, parts_note: form.partsNote,
      drive_hours: form.driveHours, drive_minutes: form.driveMinutes, notes: form.notes, finished: form.finished,
      collected_amount: form.collectedAmount, collected_method: form.collectedMethod, status: "draft",
    });
    if (error) return setMessage(error.message);
    setForm(empty);
    setReportOpen(false);
    setMessage("Job report sent. The owner will review it.");
    load();
  }

  function jobCard(card: Card) {
    const status = (card.schedule_status || "scheduled") as JobStatus;
    const mine = clock.filter((entry) => entry.doc_id === card.doc_id);
    const running = mine.find((entry) => !entry.ended_at);
    const total = mine.reduce((sum, entry) => sum + entryHours(entry, now), 0);
    const jobSpend = expenses.filter((item) => item.doc_id === card.doc_id);
    const mapUrl = card.client_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.client_address)}` : "";
    return (
      <article key={`${card.id}`} className={cardClass} data-testid={`crew-card-${card.doc_id}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-300">
              {card.job_date ? dayLabel(card.job_date) : "No date yet"}
              {card.start_time ? ` · ${timeLabel(card.start_time)}${card.end_time ? `–${timeLabel(card.end_time)}` : ""}` : ""}
            </p>
            <h3 className="mt-0.5 truncate text-lg font-bold tracking-tight">{card.client_name || card.invoice_number || "Job"}</h3>
          </div>
          {card.scheduled && <span data-testid={`job-state-${card.doc_id}`} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>{status === "done" ? (card.done_confirmed ? "Done · confirmed" : "Done · awaiting confirmation") : STATUS_LABEL[status]}</span>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm [&>*]:min-w-0 [&>*]:break-words">
          {card.client_phone
            ? <a href={`tel:${card.client_phone}`} className="flex min-h-11 items-center justify-center rounded-xl border border-teal-500/30 px-3 py-2 text-center font-medium transition hover:border-teal-400 hover:bg-teal-500/10" data-testid="call">📞 Call {card.client_phone}</a>
            : <span className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-teal-500/20 px-3 py-2 text-center opacity-50">No phone</span>}
          {mapUrl
            ? <a href={mapUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border border-teal-500/30 px-3 py-2 text-center font-medium transition hover:border-teal-400 hover:bg-teal-500/10" data-testid="map">📍 Map</a>
            : <span className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-teal-500/20 px-3 py-2 text-center opacity-50">No address</span>}
        </div>
        {card.client_address && <p className="mt-2 text-sm text-[var(--cr-muted)]">{card.client_address}</p>}
        {card.client_email && <p className="text-sm"><a className="tap underline" href={`mailto:${card.client_email}`}>{card.client_email}</a></p>}
        {(card.crewNote || card.payRow?.note) && (
          <p className="mt-2 rounded-xl bg-teal-500/10 px-3 py-2 text-sm" data-testid="crew-note">📝 {card.crewNote || card.payRow?.note}</p>
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
              🚗 {card.on_my_way_at ? `On my way · ${omwTime(card.on_my_way_at)}` : "On my way"}
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
              📷 {donePhotos.length ? "Add another photo" : "Take or choose photo"}
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" data-testid={`done-photo-input-${card.doc_id}`} onClick={nativePhotoClick((files) => pickDonePhotos(files))} onChange={(event) => { pickDonePhotos(event.target.files); event.target.value = ""; }} />
            </label>
            {donePhotos.length > 0 && (
              <div className="flex flex-wrap gap-2" data-testid="done-photo-previews">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL previews */}
                {donePhotos.map((photo, index) => <img key={index} src={photo} alt={`Finished job photo ${index + 1}`} className="h-16 w-16 rounded-lg object-cover" />)}
              </div>
            )}
            <button type="button" disabled={busy !== "" || donePhotos.length === 0} onClick={() => markDone(card)} data-testid={`done-submit-${card.doc_id}`} className="min-h-11 w-full rounded-xl bg-teal-500 px-4 py-2.5 font-semibold text-slate-950 disabled:opacity-50">
              Mark done
            </button>
            {donePhotos.length === 0 && <p className="text-xs text-[var(--cr-muted)]">Add at least one photo to mark the job done.</p>}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cr-muted)]">Your time on this job</p>
              <p className="text-2xl font-bold tabular-nums" data-testid={`timer-${card.doc_id}`}>
                {running ? fmtTimer((now) - Date.parse(running.started_at)) : fmtHours(total)}
              </p>
              {running && <p className="text-xs text-[var(--cr-muted)]">Clocked in at {clockTime(running.started_at)} · {fmtHours(total)} total</p>}
            </div>
            {running ? (
              <button type="button" disabled={busy !== ""} data-testid={`clock-out-${card.doc_id}`} onClick={() => act(`clock-${card.doc_id}`, () => crewClockOut(card.doc_id), "Clocked out.")} className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-slate-950!">Clock out</button>
            ) : (
              <button type="button" disabled={busy !== "" || Boolean(open)} data-testid={`clock-in-${card.doc_id}`} onClick={() => act(`clock-${card.doc_id}`, () => crewClockIn(card.doc_id), "Clocked in.")} className="rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950! disabled:opacity-40">{open ? "On another job" : "Clock in"}</button>
            )}
          </div>
          {mine.length > 0 && (
            <ul className="mt-3 divide-y divide-teal-500/10 border-t border-teal-500/10 text-sm">
              {mine.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid="clock-entry">
                  <span>{dayLabel(ymd(new Date(entry.started_at)))} · {clockTime(entry.started_at)} – {entry.ended_at ? clockTime(entry.ended_at) : "now"}{entry.edited_reason ? ` · edited: ${entry.edited_reason}` : ""}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{fmtHours(entryHours(entry, now))}</span>
                    <button type="button" className="text-xs font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300" onClick={() => setFixing({ id: entry.id, start: localInput(entry.started_at), end: localInput(entry.ended_at || new Date().toISOString()), reason: "" })}>Fix time</button>
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

        <div className="mt-3">
          {spendOpen === card.doc_id ? (
            <div className="space-y-3 rounded-xl border border-teal-500/30 p-3 sm:p-4" data-testid={`expense-form-${card.doc_id}`}>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="Category" className={input} value={spend.kind} onChange={(event) => setSpend({ ...spend, kind: event.target.value })}>
                  {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input aria-label="Amount" inputMode="decimal" className={input} placeholder="Amount $" value={spend.amount} onChange={(event) => setSpend({ ...spend, amount: event.target.value })} />
              </div>
              <input aria-label="What it was" className={input} placeholder="What it was" value={spend.note} onChange={(event) => setSpend({ ...spend, note: event.target.value })} />
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-teal-500/50 px-3 py-3 text-sm font-medium transition hover:bg-teal-500/10">
                📷 {spend.receipt ? "Retake receipt photo" : "Snap receipt"}
                <input aria-label="Receipt photo" type="file" accept="image/*" capture="environment" className="sr-only" onClick={nativePhotoClick((files) => pickReceipt(files[0]))} onChange={(event) => pickReceipt(event.target.files?.[0])} />
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
              {spend.receipt && <img src={spend.receipt} alt="Receipt preview" className="max-h-40 rounded-lg" data-testid="receipt-preview" />}
              <div className="flex gap-2">
                <button type="button" disabled={busy !== ""} onClick={() => saveExpense(card)} className="flex-1 rounded-xl bg-teal-500 px-3 py-2.5 font-semibold text-slate-950! transition hover:bg-teal-400 disabled:opacity-60">Save expense</button>
                <button type="button" onClick={() => setSpendOpen("")} className="rounded-xl border border-teal-500/30 px-4 py-2.5 font-medium transition hover:border-teal-400">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" data-testid={`add-expense-${card.doc_id}`} onClick={() => { setSpend({ kind: "parts", amount: "", note: "", receipt: "" }); setSpendOpen(card.doc_id); }} className="w-full rounded-xl border border-teal-500/40 px-3 py-2.5 text-sm font-medium transition hover:border-teal-400 hover:bg-teal-500/10">
              🧾 Add expense / receipt
            </button>
          )}
          {jobSpend.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-[var(--cr-muted)]">
              {jobSpend.map((item) => (
                <li key={item.id} data-testid="expense-item">{KINDS.find(([value]) => value === item.kind)?.[1] || item.kind} · ${item.amount}{item.note ? ` · ${item.note}` : ""}{item.receipt ? " · 🧾 receipt" : ""}</li>
              ))}
            </ul>
          )}
        </div>

        {card.payRow && (
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
    <main className="min-h-screen bg-[var(--cr-bg)] pb-24 text-[var(--cr-text)]">
      <header className="app-topbar sticky top-0 z-10 border-b border-teal-500/20 bg-[var(--cr-bg)] px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500 font-bold text-slate-950! shadow-sm">C</span>
            <div>
              <p className="text-sm font-semibold leading-tight" data-testid="crew-name">{name || "Your jobs"}</p>
              <p className="text-xs text-[var(--cr-muted)]">Crew</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {open && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200 tabular-nums" data-testid="header-timer">⏱ {fmtTimer((now) - Date.parse(open.started_at))}</span>}
            <button type="button" onClick={switchTheme} className="tap rounded-lg px-3 py-2 font-medium transition hover:bg-teal-500/10">{theme === "dark" ? "Light" : "Dark"}</button>
            <button type="button" className="tap whitespace-nowrap rounded-lg px-3 py-2 font-medium transition hover:bg-teal-500/10" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>Log out</button>
            <a href="/account/delete" className="tap whitespace-nowrap rounded-lg px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300" data-testid="crew-delete-account">Delete account</a>
          </div>
        </div>
        <nav className="mx-auto mt-3 grid max-w-3xl grid-cols-4 gap-1 rounded-xl border border-teal-500/20 bg-[var(--cr-card)] p-1 text-xs sm:text-sm" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-1 py-2 font-medium transition ${tab === key ? "bg-teal-500 font-semibold text-slate-950! shadow-sm" : "hover:bg-teal-500/10"}`}>{label}</button>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        {message && <p className="rounded-xl border border-teal-500/30 px-3 py-2 text-sm" role="status" data-testid="crew-message">{message}</p>}
        {offline && <p className="cr-tone-warn flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="status" data-testid="crew-offline"><span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" /><span><strong className="font-semibold">Offline.</strong> Showing what was saved on this phone. Photos and expenses you add will send when you&apos;re back online.</span></p>}
        {queue.length > 0 && (
          <div className="space-y-2 rounded-xl border border-teal-500/30 bg-[var(--cr-panel)] p-3 text-sm" data-testid="crew-queue" data-count={queue.filter((item) => !item.lastError).length}>
            {queue.some((item) => !item.lastError) && <p className="flex flex-wrap items-center gap-2"><span className="cr-tone-teal inline-flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal-500" />{queue.filter((item) => !item.lastError).length} waiting to upload</span>{offline && <span className="text-xs opacity-75">Sends when back online</span>}{!offline && <button type="button" className="ml-auto inline-flex min-h-11 min-w-11 items-center rounded-lg bg-teal-600 px-4 font-semibold text-white hover:bg-teal-500" data-testid="crew-queue-retry" onClick={() => flush()}>Send now</button>}</p>}
            {queue.filter((item) => item.lastError).map((item) => (
              <p key={item.id} className="cr-tone-bad flex flex-wrap items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800" data-testid="crew-queue-failed" data-doc-id={item.docId}>
                <span className="min-w-0 flex-1 basis-48">{item.kind === "done" ? "Done photos" : "Expense"} for {cards.find((card) => card.doc_id === item.docId)?.client_name || "a job"} couldn&apos;t be sent: {item.lastError}</span>
                <button type="button" className="ml-auto inline-flex min-h-11 min-w-11 items-center rounded-lg border border-rose-400/60 px-4 font-semibold" data-testid="crew-queue-discard" onClick={() => removeQueued(item.id).then(() => refreshQueue())}>Discard</button>
              </p>
            ))}
          </div>
        )}

        {tab === "today" && (
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight">{today ? dayLabel(today) : "Today"}</h2>
            {todayCards.length === 0 && <EmptyState icon="☀" title="Nothing scheduled for you today." className={`${cardClass} border-dashed`} />}
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
          </section>
        )}

        {tab === "week" && (
          <section className="space-y-4">
            {weekDays.map((day) => {
              const list = weekCards.filter((card) => card.job_date === day);
              if (!list.length) return null;
              return (
                <div key={day} className="space-y-2">
                  <h2 className={`text-sm font-semibold ${day === today ? "text-teal-600 dark:text-teal-300" : "text-[var(--cr-muted)]"}`}>{dayLabel(day)}{day === today ? " · Today" : ""}</h2>
                  {list.map(jobCard)}
                </div>
              );
            })}
            {weekCards.length === 0 && <p className={`${cardClass} border-dashed py-10 text-center text-sm text-[var(--cr-muted)]`}>No jobs for you this week.</p>}
            {later.length > 0 && (
              <div className="space-y-2" data-testid="coming-up">
                <h2 className="text-sm font-semibold text-[var(--cr-muted)]">Coming up</h2>
                {later.map(jobCard)}
              </div>
            )}
            {undated.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-[var(--cr-muted)]">Not scheduled yet</h2>
                {undated.map(jobCard)}
              </div>
            )}
          </section>
        )}

        {tab === "hours" && (
          <section className={cardClass} data-testid="my-hours">
            <h2 className="text-lg font-bold tracking-tight">My hours this week</h2>
            <p className="text-xs text-[var(--cr-muted)]">Clocked is from your clock in/out. Pay sheet is what your boss logged for pay.</p>
            <table className="mt-4 w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-[var(--cr-muted)]"><th className="py-2 font-semibold">Day</th><th className="py-2 text-right font-semibold">Clocked</th><th className="py-2 text-right font-semibold">Pay sheet</th></tr></thead>
              <tbody>
                {hoursByDay.map((item) => (
                  <tr key={item.day} className={`border-t border-teal-500/10 ${item.day === today ? "font-semibold" : ""}`} data-testid={`hours-${item.day}`}>
                    <td className="py-2">{dayLabel(item.day)}</td>
                    <td className="py-1.5 text-right tabular-nums">{item.clocked ? fmtHours(item.clocked) : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{item.logged ? `${item.logged.toFixed(2)} h` : "–"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-teal-500/30 font-semibold" data-testid="hours-total"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{fmtHours(weekClocked)}</td><td className="py-2 text-right tabular-nums">{weekLogged.toFixed(2)} h</td></tr>
              </tfoot>
            </table>
            <div className="mt-5 rounded-xl bg-teal-500/10 p-4 text-sm">
              <p className="text-xs text-[var(--cr-muted)]">Your confirmed pay (jobs marked paid)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">${confirmedPay.toFixed(2)}</p>
              <p className="text-xs text-[var(--cr-muted)]">Only you can see this. A scheduled job is not pay yet.</p>
            </div>
          </section>
        )}

        {tab === "hours" && <CrewDaysOff />}

        {tab === "reports" && (
          <section className="space-y-3">
            <button type="button" onClick={() => setReportOpen(!reportOpen)} className="w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400">{reportOpen ? "Close" : "New job report"}</button>
            {reportOpen && (
              <form onSubmit={saveDraft} className={`${cardClass} space-y-3`}>
                <select className={input} onChange={(event) => { const client = clients.find((item) => item.id === event.target.value); if (client) setForm({ ...form, clientName: client.name, clientPhone: client.phone || "", clientAddress: client.address || "" }); }}>
                  <option value="">Pick a client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                </select>
                <input className={input} placeholder="Who it was for" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} />
                <input className={input} placeholder="Phone" value={form.clientPhone} onChange={(event) => setForm({ ...form, clientPhone: event.target.value })} />
                <input className={input} placeholder="Address" value={form.clientAddress} onChange={(event) => setForm({ ...form, clientAddress: event.target.value })} />
                <textarea className={`${input} min-h-20`} placeholder="What was done" value={form.workDone} onChange={(event) => setForm({ ...form, workDone: event.target.value })} />
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <label className="space-y-1 text-sm font-medium">Date<input type="date" className={input} value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Hours<input className={input} value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">Start<input type="time" className={input} value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium">End<input type="time" className={input} value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
                </div>
                <input className={input} placeholder="Parts, gas, or dump fee you paid" value={form.partsCost} onChange={(event) => setForm({ ...form, partsCost: event.target.value })} />
                <input className={input} placeholder="What it was" value={form.partsNote} onChange={(event) => setForm({ ...form, partsNote: event.target.value })} />
                <textarea className={`${input} min-h-16`} placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                <label className="flex items-center gap-3 rounded-xl border border-teal-500/20 px-3 py-3 text-sm font-medium"><input className="h-4 w-4 accent-teal-500" type="checkbox" checked={form.finished} onChange={(event) => setForm({ ...form, finished: event.target.checked })} /> Job is finished</label>
                <button type="submit" className="sticky bottom-3 w-full rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950! shadow-lg transition hover:bg-teal-400">Send job report</button>
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
      </div>
    </main>
  );
}
