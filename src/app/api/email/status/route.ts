import { emailConfig } from "@/lib/email-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether the app can send email itself (yes/no only). Otherwise the app falls back to mailto. */
export async function GET() {
  return Response.json({ enabled: emailConfig().enabled }, { headers: { "cache-control": "no-store" } });
}
