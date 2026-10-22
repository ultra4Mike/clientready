/**
 * Autosave drafts API (Help & Platform). Dev builds useAutosaveDraft + the restore UI on top of this.
 *
 *   getDraft(formKey, recordId?)            -> Draft | null   (device first; cloud copy if signed in and none on device)
 *   putDraft(formKey, recordId, payload)    -> Draft          (writes IndexedDB now; cloud when online + signed in; else queued)
 *   clearDraft(formKey, recordId?)          -> void           (device + cloud; call after Save / Discard)
 *   listDrafts()                            -> Draft[]        (this device, newest first, < 30 days)
 *   onDraftStatus(cb)                       -> unsubscribe     (cb({status, formKey, recordId, server?, serverVersion?}))
 *   flushDrafts()                           -> {sent,left}    (auto on online / visibilitychange(hidden) / pagehide)
 *   initDrafts()                            -> void           (idempotent; called by putDraft/getDraft; asks storage.persist())
 *
 * Status values: "saved-local" | "synced" | "offline-queued" | "conflict".
 * putDraft is debounce-friendly: call it on every change (the hook debounces ~300ms); cloud sends coalesce per record.
 * Guest/device mode (no session): local only. Signed-out wipe: wipeThisDevice() deletes the device DB.
 * Cloud: table form_drafts + rpc put_form_draft (migration 20261025110000_form_drafts.sql).
 * Planned UI labels: "Saved on this device", "Synced", "Offline – will sync", "Restored your unsaved changes".
 */
import { idbDel, idbEntries, idbGet, idbSet, mirrorLocalToIdb, requestPersistentStorage } from "./device-store";
import { createQueue, type QueueJob } from "./offline-queue";

export type DraftStatus = "saved-local" | "synced" | "offline-queued" | "conflict";
export type Draft<P = unknown> = { formKey: string; recordId: string; payload: P; baseVersion: number; updatedAt: string; deviceId: string; dirty: boolean };
export type DraftStatusEvent = { status: DraftStatus; formKey: string; recordId: string; server?: unknown; serverVersion?: number };
export const DRAFT_MAX_AGE_DAYS = 30;
export const DRAFT_MAX_BYTES = 512 * 1024;

/** Cloud adapter (swappable in tests). */
export type DraftCloud = {
  userId(): Promise<string | null>;
  put(d: { formKey: string; recordId: string; payload: unknown; baseVersion: number; deviceId: string }): Promise<{ status: "ok" | "conflict"; version: number; server_payload: unknown }>;
  get(formKey: string, recordId: string): Promise<{ payload: unknown; version: number; updated_at: string } | null>;
  del(formKey: string, recordId: string): Promise<void>;
};

const supabaseCloud: DraftCloud = {
  async userId() {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },
  async put(d) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.rpc("put_form_draft", { p_form_key: d.formKey, p_record_id: d.recordId, p_payload: d.payload, p_base_version: d.baseVersion, p_device_id: d.deviceId });
    if (error) throw error;
    return data as { status: "ok" | "conflict"; version: number; server_payload: unknown };
  },
  async get(formKey, recordId) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.from("form_drafts").select("payload, version, updated_at").eq("form_key", formKey).eq("record_id", recordId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async del(formKey, recordId) {
    const { supabase } = await import("./supabase");
    const { error } = await supabase.from("form_drafts").delete().eq("form_key", formKey).eq("record_id", recordId);
    if (error) throw error;
  },
};
let cloud: DraftCloud = supabaseCloud;
let isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
/** Tests only. */
export function __setDraftEnv(env: { cloud?: DraftCloud; online?: () => boolean }) {
  if (env.cloud) cloud = env.cloud;
  if (env.online) isOnline = env.online;
}

const key = (formKey: string, recordId = "") => `${formKey}::${recordId}`;
const listeners = new Set<(e: DraftStatusEvent) => void>();
function emit(e: DraftStatusEvent) {
  for (const cb of listeners) try { cb(e); } catch { /* listener bug must not break saving */ }
}
export function onDraftStatus(cb: (e: DraftStatusEvent) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

async function deviceId() {
  let id = await idbGet<string>("kv", "device-id");
  if (!id) {
    id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await idbSet("kv", "device-id", id);
  }
  return id;
}

type Job = { formKey: string; recordId: string };
const queue = createQueue<Job>("drafts", async (job: QueueJob<Job>) => {
  if (!isOnline()) return { status: "retry" };
  const local = await idbGet<Draft>("drafts", key(job.payload.formKey, job.payload.recordId));
  if (!local) return { status: "ok" }; // cleared meanwhile
  if (!(await cloud.userId())) return { status: "ok" }; // signed out: stays local
  const res = await cloud.put({ formKey: local.formKey, recordId: local.recordId, payload: local.payload, baseVersion: local.baseVersion, deviceId: local.deviceId });
  if (res.status === "conflict") {
    emit({ status: "conflict", formKey: local.formKey, recordId: local.recordId, server: res.server_payload, serverVersion: res.version });
    return { status: "conflict", server: res.server_payload, version: res.version };
  }
  const latest = await idbGet<Draft>("drafts", key(local.formKey, local.recordId));
  if (latest) await idbSet("drafts", key(local.formKey, local.recordId), { ...latest, baseVersion: res.version, dirty: latest.updatedAt !== local.updatedAt });
  emit({ status: "synced", formKey: local.formKey, recordId: local.recordId });
  return { status: "ok" };
});

let inited = false;
export function initDrafts() {
  if (inited) return;
  inited = true;
  void requestPersistentStorage();
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    void mirrorLocalToIdb().catch(() => 0);
    const flush = () => { void flushDrafts(); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener?.("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  }
}

function fresh(d: Draft | undefined) {
  return !!d && Date.now() - Date.parse(d.updatedAt) < DRAFT_MAX_AGE_DAYS * 86_400_000;
}

export async function getDraft<P = unknown>(formKey: string, recordId = ""): Promise<Draft<P> | null> {
  initDrafts();
  const local = await idbGet<Draft<P>>("drafts", key(formKey, recordId));
  if (fresh(local)) return local!;
  if (!isOnline()) return null;
  try {
    if (!(await cloud.userId())) return null;
    const row = await cloud.get(formKey, recordId);
    if (!row) return null;
    const d: Draft<P> = { formKey, recordId, payload: row.payload as P, baseVersion: row.version, updatedAt: row.updated_at, deviceId: await deviceId(), dirty: false };
    if (!fresh(d as Draft)) return null;
    await idbSet("drafts", key(formKey, recordId), d);
    return d;
  } catch {
    return null;
  }
}

/** Saves to the device immediately, then sends to the cloud (or queues it). Emits saved-local, then synced / offline-queued / conflict. */
export async function putDraft<P = unknown>(formKey: string, recordId: string | undefined, payload: P): Promise<Draft<P>> {
  initDrafts();
  const rid = recordId ?? "";
  if (JSON.stringify(payload).length >= DRAFT_MAX_BYTES) throw new Error("Draft is too large to save (512 KB limit)");
  const prev = await idbGet<Draft<P>>("drafts", key(formKey, rid));
  const d: Draft<P> = { formKey, recordId: rid, payload, baseVersion: prev?.baseVersion ?? 0, updatedAt: new Date().toISOString(), deviceId: await deviceId(), dirty: true };
  await idbSet("drafts", key(formKey, rid), d);
  emit({ status: "saved-local", formKey, recordId: rid });
  await queue.enqueue({ recordKey: key(formKey, rid), idempotencyKey: key(formKey, rid), payload: { formKey, recordId: rid }, baseVersion: d.baseVersion });
  if (!isOnline() || !(await cloud.userId().catch(() => null))) {
    if (!isOnline()) emit({ status: "offline-queued", formKey, recordId: rid });
    return d;
  }
  const r = await flushDrafts();
  if (r.left > 0 && !(await queue.jobs()).some((j) => j.state === "conflict" && j.recordKey === key(formKey, rid))) emit({ status: "offline-queued", formKey, recordId: rid });
  return d;
}

/**
 * Resolves a conflict. "mine": keep this device's payload and overwrite the server (rebase on serverVersion).
 * "theirs": take the server payload locally. Either way the parked queue job is cleared.
 */
export async function resolveDraftConflict(formKey: string, recordId: string | undefined, choice: "mine" | "theirs", server: { payload: unknown; version: number }) {
  const rid = recordId ?? "";
  await queue.remove(key(formKey, rid));
  const local = await idbGet<Draft>("drafts", key(formKey, rid));
  if (choice === "theirs" || !local) {
    await idbSet("drafts", key(formKey, rid), { ...(local ?? { formKey, recordId: rid, deviceId: await deviceId() }), payload: server.payload, baseVersion: server.version, updatedAt: new Date().toISOString(), dirty: false });
    return;
  }
  await idbSet("drafts", key(formKey, rid), { ...local, baseVersion: server.version });
  await putDraft(formKey, rid, local.payload);
}

export async function clearDraft(formKey: string, recordId = ""): Promise<void> {
  await idbDel("drafts", key(formKey, recordId));
  await queue.remove(key(formKey, recordId));
  try {
    if (isOnline() && (await cloud.userId())) await cloud.del(formKey, recordId);
  } catch { /* the 30-day purge removes it */ }
}

export async function listDrafts(): Promise<Draft[]> {
  const all = (await idbEntries<Draft>("drafts")).map(([, d]) => d);
  for (const d of all) if (!fresh(d)) await idbDel("drafts", key(d.formKey, d.recordId));
  return all.filter(fresh).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function flushDrafts() {
  return queue.flush();
}
