import { docAmounts } from "@/lib/doc-stage";
import { ownerJobCost } from "@/lib/reports";
import { uniqueDocs } from "@/lib/change-orders";
import { isPendingRecurringDraft } from "@/lib/recurring";

/**
 * Profit alerts (owner only, never shown to customers or crew). A job is flagged when its owner job costs
 * are more than the price (loss), when what's left is under the owner's minimum margin (Profile, default
 * 20%, blank or 0 = off), or when the crew reported spending well over the owner's estimate. Alerts only
 * inform; nothing on the invoice changes.
 */
export type ProfitAlert = { kind: "loss" | "low-margin" | "crew-over"; text: string };
type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt?: string; data?: Record<string, unknown> };

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Set-aside percent: a number 0-100 as saved (0 means 0); blank or invalid uses 30. */
/** Set-aside box text clamped to 0–100; blank or non-numbers are left for the form's own message. */
export function clampPercentText(raw: string) {
  const text = raw.trim();
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return text;
  const n = Number(text);
  return n < 0 ? "0" : n > 100 ? "100" : text;
}

export function readSetAside(raw: unknown) {
  const text = String(raw ?? "").trim();
  const value = Number(text);
  return text === "" || !Number.isFinite(value) ? 30 : Math.min(100, Math.max(0, value));
}

export function readMinMargin(profile: Record<string, unknown> | null | undefined) {
  const raw = profile?.profitAlertMargin;
  return raw === undefined || raw === null ? 20 : Math.min(95, Math.max(0, num(raw)));
}

export function crewReportTotal(value: unknown) {
  const lines = value && typeof value === "object" && Array.isArray((value as { lines?: unknown }).lines) ? ((value as { lines: { amount?: unknown }[] }).lines) : [];
  return r2(lines.reduce((sum, line) => sum + Math.max(0, num(line.amount)), 0));
}

export function profitAlerts(input: { total: number; jobCost: number; crewTotal?: number; minMargin: number }): ProfitAlert[] {
  const { total, jobCost, minMargin } = input;
  const crewTotal = input.crewTotal || 0;
  const out: ProfitAlert[] = [];
  if (total > 0 && jobCost > 0) {
    const left = r2(total - jobCost);
    const margin = Math.round((left / total) * 100);
    if (left < 0) out.push({ kind: "loss", text: `Job costs ($${jobCost.toFixed(2)}) are more than the price ($${total.toFixed(2)}): a $${(-left).toFixed(2)} loss.` });
    else if (minMargin > 0 && margin < minMargin) out.push({ kind: "low-margin", text: `Only ${margin}% left after job costs ($${left.toFixed(2)} of $${total.toFixed(2)}). Your minimum is ${minMargin}%.` });
  }
  if (crewTotal > 0 && crewTotal - jobCost > Math.max(5, jobCost * 0.1)) {
    out.push({ kind: "crew-over", text: `Crew reported $${crewTotal.toFixed(2)} in costs, $${(crewTotal - jobCost).toFixed(2)} more than your job costs ($${jobCost.toFixed(2)}).` });
  }
  return out;
}

/** Dashboard: sent/paid invoices from the last `days` days with an alert, worst first. */
export function profitAlertJobs(allDocs: Doc[], minMargin: number, today = new Date(), days = 90) {
  const since = new Date(today.getTime() - days * 86400000).toISOString().slice(0, 10);
  const rows: { id: string; number: string; client: string; total: number; jobCost: number; left: number; alerts: ProfitAlert[] }[] = [];
  for (const doc of uniqueDocs(allDocs)) {
    if (doc.type !== "invoice" || isPendingRecurringDraft(doc)) continue;
    const data = doc.data || {};
    if (String(data.status || "draft") === "draft") continue;
    const date = String(data.invoiceDate || doc.createdAt || "").slice(0, 10);
    if (date && date < since) continue;
    const { total } = docAmounts(doc);
    const jobCost = r2(ownerJobCost(data));
    const alerts = profitAlerts({ total, jobCost, crewTotal: crewReportTotal(data.crewReport), minMargin });
    if (alerts.length) rows.push({ id: doc.id, number: String(data.invoiceNumber || doc.title || "Invoice"), client: String(data.clientName || doc.clientName || ""), total, jobCost, left: r2(total - jobCost), alerts });
  }
  return rows.sort((a, b) => a.left / (a.total || 1) - b.left / (b.total || 1));
}
