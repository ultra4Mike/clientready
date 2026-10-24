import { supabase } from "@/lib/supabase";

/** fetch() to our own API with the signed-in user's access token (owner or crew). No token: plain fetch (gets 401). */
export async function authedFetch(input: string, init: RequestInit = {}) {
  let token = "";
  try { token = (await supabase.auth.getSession()).data.session?.access_token || ""; } catch { /* signed out */ }
  const headers = new Headers(init.headers || {});
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
