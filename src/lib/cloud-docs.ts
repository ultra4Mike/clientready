import { supabase } from "./supabase";
import { markSynced, markUnsynced } from "./sync-status";

export type CloudDoc = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

export async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || "";
}
export async function deleteCloudDocument(id: string) {
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from("documents").delete().eq("id", id).eq("user_id", userId);
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
  return data.map((row) => ({
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
      const cloudApproval = (current.data as Record<string, unknown> | null)?.approval;
      if (cloudApproval) doc.data.approval = cloudApproval;
      else delete doc.data.approval;
      // A crew member may have updated the job status in the cloud since this copy was loaded.
      const cloudSchedule = (current.data as Record<string, unknown> | null)?.schedule as { updatedAt?: string } | undefined;
      const mine = doc.data.schedule as { updatedAt?: string } | undefined;
      if (cloudSchedule && (!mine || Date.parse(cloudSchedule.updatedAt || "") > Date.parse(mine.updatedAt || ""))) doc.data.schedule = cloudSchedule;
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
    else markSynced(doc.id);
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
    .select("id")
    .single();

  if (insertError || !data?.id) {
    markUnsynced(doc.id);
    return doc.id;
  }
  markSynced(doc.id, data.id);
  return data.id;
}