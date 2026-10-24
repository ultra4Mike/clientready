import { createClient } from "@supabase/supabase-js";
import { applySessionPolicyEarly } from "@/lib/session-policy";

// Part 3: drop a session that must not survive (browser closed without "Keep me signed in", or idle too long)
// before the client reads storage, so no page ever renders signed in first.
applySessionPolicyEarly();

// Crew/owner data must never come from an HTTP cache (a reschedule has to show on the next read).
const noStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { global: { fetch: noStore } }
);
