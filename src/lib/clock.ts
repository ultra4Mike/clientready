import { supabase } from "@/lib/supabase";

export type ClockEntry = {
  id: string;
  owner_id?: string;
  doc_id: string;
  employee_id: string;
  worker_email: string;
  worker_name?: string;
  started_at: string;
  ended_at?: string | null;
  edited_reason?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
};

const OWNER_CACHE = "clientready-clock-entries";

export function entryHours(entry: ClockEntry, now = Date.now()) {
  const start = Date.parse(entry.started_at);
  const end = entry.ended_at ? Date.parse(entry.ended_at) : now;
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start) / 3600000;
}

export function hoursByWorker(entries: ClockEntry[], docId: string) {
  const out: Record<string, number> = {};
  for (const entry of entries) if (entry.doc_id === docId) out[entry.employee_id] = (out[entry.employee_id] || 0) + entryHours(entry);
  return out;
}

export function readOwnerClock(): ClockEntry[] {
  try {
    const raw = window.localStorage.getItem(OWNER_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Owner: clock entries for their jobs (RLS returns only rows they own). Cached for the job pages. */
export async function refreshOwnerClock(): Promise<ClockEntry[]> {
  const { data, error } = await supabase.from("crew_clock").select("*").order("started_at", { ascending: true });
  if (error || !data) return readOwnerClock();
  window.localStorage.setItem(OWNER_CACHE, JSON.stringify(data));
  return data as ClockEntry[];
}

/** Owner: fix an entry (e.g. a forgotten clock-out). */
export async function ownerEditClock(id: string, startedAt: string, endedAt: string) {
  const { error } = await supabase
    .from("crew_clock")
    .update({ started_at: startedAt, ended_at: endedAt, edited_reason: "Edited by owner", edited_at: new Date().toISOString(), edited_by: "owner" })
    .eq("id", id);
  return error ? error.message : "";
}

export async function crewClockIn(docId: string) {
  const { error } = await supabase.rpc("crew_clock_in", { p_doc_id: docId });
  return error ? error.message : "";
}
export async function crewClockOut(docId: string) {
  const { error } = await supabase.rpc("crew_clock_out", { p_doc_id: docId });
  return error ? error.message : "";
}
export async function crewEditClock(id: string, startedAt: string, endedAt: string, reason: string) {
  const { error } = await supabase.rpc("crew_edit_clock", { p_id: id, p_started: startedAt, p_ended: endedAt, p_reason: reason });
  return error ? error.message : "";
}

/** Shrinks a photo to at most `max` px on the long side as JPEG, so receipts stay small. */
export function compressImage(file: File, max = 1280, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the photo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a photo"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Could not process the photo"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export function fmtHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 60 ? `${h + 1}h 0m` : `${h}h ${m}m`;
}
export function fmtTimer(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
