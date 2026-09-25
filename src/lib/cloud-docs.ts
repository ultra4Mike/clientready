import { supabase } from "./supabase";

export type CloudDoc = {
  id: string;
  type: string;
  title: string;
  clientName: string;
  createdAt: string;
  data: Record<string, unknown>;
};

function isUuid(id: string) {
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

export async function loadCloudDocuments() {
  const userId = await getUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
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

export async function saveCloudDocument(doc: CloudDoc) {
  const userId = await getUserId();
  if (!userId) return doc.id;

  if (isUuid(doc.id)) {
    await supabase
      .from("documents")
      .update({
        type: doc.type,
        title: doc.title,
        client_name: doc.clientName,
        data: doc.data,
      })
      .eq("id", doc.id)
      .eq("user_id", userId);
    return doc.id;
  }

  const { data } = await supabase
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

  return data?.id || doc.id;
}