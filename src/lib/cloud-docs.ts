import { mergeHoursApprovals } from "@/lib/hours-approval";
import { supabase } from "./supabase";
import { allTombstones, flushDeletes, recordDelete } from "./doc-tombstones";
import { markSynced, markUnsynced } from "./sync-status";
import { keepStripePayments } from "./payments";

export type CloudDoc = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

import { mergeData, readBase, writeBases } from "@/lib/three-way";

export function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

export async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || "";
}
/**
 * Deletes a document everywhere. The delete is remembered on this device first (so no merge brings it
 * back) and queued; it is sent now if online, otherwise on the next sync.
 */
export async function deleteCloudDocument(id: string) {
  recordDelete(id);
  const userId = await getUserId();
  if (!userId) return;
  await flushDeletes(userId);
}

/** Cloud documents for the signed-in user, or null when signed out or the fetch failed. */
export async function fetchCloudDocuments(): Promise<CloudDoc[] | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return null;
  const deleted = await allTombstones(userId);
  return data.filter((row) => !deleted.has(row.id)).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title || "",
    clientName: row.client_name || "",
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString()
      : "",
    data: row.data || {},
  })) as CloudDoc[];
}

/** Older callers: [] when signed out or on error. */
export async function loadCloudDocuments() {
  return (await fetchCloudDocuments()) || [];
}

export async function saveCloudDocument(doc: CloudDoc) {
  // Every save records when it happened, so cloud/local merges can keep the newer copy.
  // (Mutates doc.data so callers that store the same object locally keep the same stamp.)
  doc.data = doc.data || {};
  doc.data.updatedAt = new Date().toISOString();
  await materializeSchedule(doc);
  const userId = await getUserId();
  if (!userId) {
    // Signed in but unreachable (offline / network error): remember to upload it later.
    const { data: session } = await supabase.auth.getSession();
    if (session.session) markUnsynced(doc.id);
    return doc.id;
  }

  if (isUuid(doc.id)) {
    // The approval block is owned by the cloud (the customer approves there, and only the share/
    // revoke actions change it), so an ordinary save always carries the cloud's current block.
    const { data: current, error: readError } = await supabase
      .from("documents")
      .select("data")
      .eq("id", doc.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!readError && current) {
      // Changes saved from another device since this one last synced are kept (field/entry-level merge).
      const base = readBase(doc.id);
      if (base && current.data) {
        const stamp = doc.data.updatedAt;
        const { data: mergedData } = mergeData(base, doc.data, current.data as Record<string, unknown>);
        for (const key of Object.keys(doc.data)) delete doc.data[key];
        Object.assign(doc.data, mergedData, { updatedAt: stamp });
      }
      const cloudApproval = (current.data as Record<string, unknown> | null)?.approval;
      if (cloudApproval) doc.data.approval = cloudApproval;
      else delete doc.data.approval;
      // A crew member may have updated the job status in the cloud since this copy was loaded.
      const cloudSchedule = (current.data as Record<string, unknown> | null)?.schedule as { updatedAt?: string } | undefined;
      const mine = doc.data.schedule as { updatedAt?: string } | undefined;
      if (cloudSchedule && (!mine || Date.parse(cloudSchedule.updatedAt || "") > Date.parse(mine.updatedAt || ""))) doc.data.schedule = cloudSchedule;
      // Hours approvals: newer decision per worker wins; an older offline copy can't undo one (Help R27).
      const cloudApprovals = (current.data as Record<string, unknown> | null)?.hoursApprovals;
      if (cloudApprovals || doc.data.hoursApprovals) {
        const merged = mergeHoursApprovals(doc.data.hoursApprovals, cloudApprovals);
        if (Object.keys(merged).length) doc.data.hoursApprovals = merged;
      }
      // Card payments recorded by Stripe on the server are never dropped by a save from an older copy.
      const withStripe = keepStripePayments(doc.data, current.data as Record<string, unknown> | null);
      if (withStripe !== doc.data) Object.assign(doc.data, withStripe);
      // Emails logged from another device are kept too (append-only log, matched by time + recipient).
      const cloudLog = (current.data as Record<string, unknown> | null)?.emailLog;
      if (Array.isArray(cloudLog) && cloudLog.length) {
        const mineLog = Array.isArray(doc.data.emailLog) ? (doc.data.emailLog as { sentAt?: string; to?: string }[]) : [];
        const seen = new Set(mineLog.map((entry) => `${entry.sentAt}|${entry.to}`));
        const missing = (cloudLog as { sentAt?: string; to?: string }[]).filter((entry) => entry && !seen.has(`${entry.sentAt}|${entry.to}`));
        if (missing.length) doc.data.emailLog = [...missing, ...mineLog].sort((x, y) => String(x.sentAt).localeCompare(String(y.sentAt)));
      }
    }
    const { error: writeError } = await supabase
      .from("documents")
      .update({
        type: doc.type,
        title: doc.title,
        client_name: doc.clientName,
        data: doc.data,
      })
      .eq("id", doc.id)
      .eq("user_id", userId);
    if (writeError) markUnsynced(doc.id);
    else {
      markSynced(doc.id);
      writeBases([{ id: doc.id, data: doc.data }]);
      await mirrorToCrew({ ...doc });
    }
    return doc.id;
  }

  const { data, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      type: doc.type,
      title: doc.title,
      client_name: doc.clientName,
      data: doc.data,
    })
    .select("id, title, data")
    .single();

  if (insertError || !data?.id) {
    markUnsynced(doc.id);
    return doc.id;
  }
  // R101: the server gave this new document the next free number (its number was already used).
  const saved = (data.data || {}) as Record<string, unknown>;
  if (saved.renumberedFrom && saved.invoiceNumber !== doc.data.invoiceNumber) {
    const from = String(saved.renumberedFrom), to = String(saved.invoiceNumber);
    doc.data.invoiceNumber = to; doc.data.renumberedFrom = from; doc.title = String(data.title || doc.title);
    try {
      const list = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") as CloudDoc[];
      window.localStorage.setItem("clientready-documents", JSON.stringify(list.map((item) => (item.id === doc.id || item.id === data.id ? { ...item, title: doc.title, data: { ...(item.data || {}), invoiceNumber: to, renumberedFrom: from } } : item))));
    } catch { /* cache only */ }
    window.dispatchEvent(new CustomEvent("clientready-renumbered", { detail: { id: data.id, from, to } }));
  }
  markSynced(doc.id, data.id);
  writeBases([{ id: data.id, data: doc.data }]);
  await mirrorToCrew({ ...doc, id: data.id });
  return data.id;
}

/**
 * B1/B2: every saved invoice/proposal keeps the crew app's schedule rows in step (date, times,
 * checklist, status), whatever screen saved it. Errors never block the owner's save.
 */
/**
 * B1: a job/proposal that is on the calendar only through its dates (no schedule block) but has
 * crew gets its schedule block written, so crew Done/checklist/status have one place to land.
 */
async function materializeSchedule(doc: CloudDoc) {
  if ((doc.type !== "invoice" && doc.type !== "proposal") || !doc.data || doc.data.schedule) return;
  try {
    const { readSchedule } = await import("@/lib/schedule");
    const derived = readSchedule(doc.data);
    if (derived && derived.workerIds.length) doc.data.schedule = { ...derived, updatedAt: doc.data.updatedAt };
  } catch {
    // leave it derived
  }
}

async function mirrorToCrew(doc: CloudDoc) {
  if (doc.type !== "invoice" && doc.type !== "proposal") return;
  try {
    const { syncScheduleCrewJobs } = await import("@/lib/schedule");
    await syncScheduleCrewJobs(doc);
  } catch {
    // the next save or the Team > Crew dates check catches it up
  }
}