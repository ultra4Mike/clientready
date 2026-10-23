/**
 * Backlog 13: optional automations, every switch OFF until the owner turns it on in Profile. They run
 * when the owner's app opens the dashboard. The app only asks; /api/email/send rebuilds the templated
 * email from the saved invoice, claims (doc, kind, period) on the server first (R46: two devices or a
 * reload can't double send), checks limits, and sends only to the invoice's client.
 */
import { supabase } from "@/lib/supabase";
import { logEmail, emailSendingEnabled } from "@/lib/email";
import { planOne, sentKeys, type AutoDoc, type AutoPlan, type Automations } from "@/lib/automation-email";
export { AUTOMATIONS_OFF, readAutomations, LATE_REMINDER_DAYS, LATE_REMINDER_MAX } from "@/lib/automation-email";
export type { Automations, AutoPlan } from "@/lib/automation-email";
import { readAutomations } from "@/lib/automation-email";

type Client = { id?: string; name?: string; reviewOptOut?: boolean; autoEmailOptOut?: boolean };

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function clientFor(clients: Client[], data: Record<string, unknown>, name: string) {
  const id = String(data.clientId || ""); const n = name.trim().toLowerCase();
  return clients.find((c) => (id && c.id === id) || (!id && n && String(c.name || "").trim().toLowerCase() === n)) || null;
}

/** Pure: which emails the switches would send now. */
export function planAutomations(docs: AutoDoc[], settings: Automations, ctx: { business: string; reviewLink: string; origin: string; today?: string; clients?: Client[] }): AutoPlan[] {
  const out: AutoPlan[] = [];
  for (const doc of docs) {
    const client = clientFor(ctx.clients || [], doc.data || {}, String(doc.clientName || doc.data?.clientName || ""));
    const item = planOne(doc, settings, { business: ctx.business, reviewLink: ctx.reviewLink, origin: ctx.origin, today: ctx.today || localToday(), reviewOptOut: Boolean(client?.reviewOptOut), autoOptOut: Boolean(client?.autoEmailOptOut), chain: docs });
    if (item) out.push(item);
  }
  return out;
}

function stamp(docId: string, key: string, at: string) {
  const all: AutoDoc[] = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]");
  const doc = all.find((d) => d.id === docId);
  if (!doc) return;
  const prev = ((doc.data || {}).autoSent || {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...sentKeys(doc.data), key]));
  doc.data = { ...(doc.data || {}), autoSent: { ...prev, keys, ...(key === "done:once" && !prev.done ? { done: at } : {}) } };
  window.localStorage.setItem("clientready-documents", JSON.stringify(all));
}

/** R46 sync merge: server claims (any device) are added to each invoice's sent log before planning. */
async function mergeServerClaims() {
  try {
    const { data, error } = await supabase.from("automation_sends").select("doc_id,kind,period,claimed_at");
    if (error || !Array.isArray(data)) return;
    for (const row of data as { doc_id: string; kind: string; period: string; claimed_at: string }[]) stamp(row.doc_id, `${row.kind}:${row.period}`, row.claimed_at);
  } catch { /* offline: the server claim still blocks repeats */ }
}

/** Runs the plan (owner's app, dashboard load). Returns what was sent. Nothing runs when every switch is off. */
export async function runAutomations(): Promise<{ sent: AutoPlan[]; errors: string[] }> {
  let profile: Record<string, unknown> = {};
  try { profile = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}") || {}; } catch { profile = {}; }
  const settings = readAutomations(profile.automations);
  if (!settings.doneEmailInvoice && !settings.lateReminderEmail) return { sent: [], errors: [] };
  if (!(await emailSendingEnabled())) return { sent: [], errors: ["Automatic emails are on, but email sending is not set up."] };
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) return { sent: [], errors: ["Automatic emails are on: sign in so they can send."] };
  await mergeServerClaims();
  let docs: AutoDoc[] = []; let clients: Client[] = [];
  try { docs = JSON.parse(window.localStorage.getItem("clientready-documents") || "[]") || []; } catch { docs = []; }
  try { clients = JSON.parse(window.localStorage.getItem("clientready-clients") || "[]") || []; } catch { clients = []; }
  const plan = planAutomations(docs, settings, { business: String(profile.businessName || "Your business"), reviewLink: String(profile.reviewLink || ""), origin: window.location.origin, clients });
  const sent: AutoPlan[] = []; const errors: string[] = [];
  for (const item of plan) {
    const response = await fetch("/api/email/send", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ docId: item.docId, automation: { kind: item.kind, period: item.period }, today: localToday() }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => ({}))) as { id?: string; error?: string; to?: string; subject?: string; text?: string };
    const key = `${item.kind}:${item.period}`;
    if (response?.status === 409) { stamp(item.docId, key, new Date().toISOString()); continue; } // already sent elsewhere
    if (!response?.ok) { errors.push(`${item.subject}: ${result.error || "not sent"}`); continue; }
    const at = new Date().toISOString();
    stamp(item.docId, key, at);
    await logEmail(item.docId, { sentAt: at, to: result.to || item.to, subject: result.subject || item.subject, kind: item.kind === "done" ? "invoice" : "reminder", via: "email", id: String(result.id || "") }, item.kind === "done");
    sent.push(item);
  }
  return { sent, errors };
}
