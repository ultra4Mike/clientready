// Server-only email helpers. Never import from client components.
export function emailConfig() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "";
  const apiBase = (process.env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { apiKey, from, apiBase, supabaseUrl, anonKey, enabled: Boolean(apiKey && from && supabaseUrl && anonKey) };
}
