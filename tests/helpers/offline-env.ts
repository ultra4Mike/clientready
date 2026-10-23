// Unit tests that import modules touching the Supabase client: a dummy offline URL (no network calls are made).
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "x";
// Node 20 has no global WebSocket; the realtime client only needs the constructor to exist.
const g = globalThis as { WebSocket?: unknown };
if (!g.WebSocket) g.WebSocket = class {};
export {};
