import { supabase } from "@/lib/supabase";

type NewClient = { name: string; company?: string; email?: string; phone?: string; address?: string };

/** R116: a client typed on an invoice becomes a saved client (cloud + local cache). Returns its id or "". */
export async function createClientFromInvoice(client: NewClient): Promise<string> {
  const name = client.name.trim();
  if (!name) return "";
  const list = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]") as ({ id: string } & NewClient)[];
  const key = (v?: string) => String(v || "").trim().toLowerCase();
  const found = list.find((c) => (client.email && key(c.email) === key(client.email)) || key(c.name) === key(name));
  if (found) return found.id;
  const { data: auth } = await supabase.auth.getUser();
  const fields = { name, company: client.company || "", email: client.email || "", phone: client.phone || "", address: client.address || "" };
  let id = "";
  if (auth.user) {
    const { data } = await supabase.from("clients").insert({ user_id: auth.user.id, ...fields }).select("id").single();
    id = String((data as { id?: string } | null)?.id || "");
  }
  if (!id) id = Date.now().toString();
  window.localStorage.setItem("clientready-clients", JSON.stringify([...list, { id, ...fields }]));
  return id;
}
