import { createClient } from "@supabase/supabase-js";

// Crew/owner data must never come from an HTTP cache (a reschedule has to show on the next read).
const noStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: noStore } }
);
