import { docAmounts } from "@/lib/doc-stage";
import { ownerJobCost } from "@/lib/reports";
import { uniqueDocs } from "@/lib/change-orders";
import { isPendingRecurringDraft } from "@/lib/recurring";
import { jobProfit, type JobProfit } from "@/lib/job-profit";

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

/**
 * Help retest fix: with `breakdown` (lib/job-profit, the "Profit after all costs" line on the invoice) the loss and
 * margin checks use the SAME all-in profit the owner sees (card fees, mileage and refunds included); before, the
 * alert only counted the job-cost boxes, so an invoice could show e.g. 12% after all costs with no alert.
 */
export function profitAlerts(input: { total: number; jobCost: number; crewTotal?: number; minMargin: number; breakdown?: JobProfit }): ProfitAlert[] {
  const { jobCost, minMargin, breakdown } = input;
  const total = breakdown ? breakdown.total : input.total;
  const allCost = breakdown ? r2(breakdown.total - breakdown.profit) : jobCost;
  const crewTotal = input.crewTotal || 0;
  const out: ProfitAlert[] = [];
  if (total > 0 && allCost > 0) {
    const left = r2(total - allCost);
    const margin = Math.round((left / total) * 100);
    const label = breakdown ? "All costs" : "Job costs";
    if (left < 0) out.push({ kind: "loss", text: `${label} ($${allCost.toFixed(2)}) are more than the price ($${total.toFixed(2)}): a $${(-left).toFixed(2)} loss.` });
    else if (minMargin > 0 && margin < minMargin) out.push({ kind: "low-margin", text: `Only ${margin}% left after ${breakdown ? "all costs" : "job costs"} ($${left.toFixed(2)} of $${total.toFixed(2)}). Your minimum is ${minMargin}%.` });
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
    if (["draft", "void", "voided", "deleted"].includes(String(data.status || "draft")) || data.deleted) continue;
    const date = String(data.invoiceDate || doc.createdAt || "").slice(0, 10);
    if (date && date < since) continue;
    const { total } = docAmounts(doc);
    const jobCost = r2(ownerJobCost(data));
    const breakdown = jobProfit({ total, data });
    const alerts = profitAlerts({ total, jobCost, crewTotal: crewReportTotal(data.crewReport), minMargin, breakdown });
    if (alerts.length) rows.push({ id: doc.id, number: String(data.invoiceNumber || doc.title || "Invoice"), client: String(data.clientName || doc.clientName || ""), total: breakdown.total, jobCost, left: breakdown.profit, alerts });
  }
  return rows.sort((a, b) => a.left / (a.total || 1) - b.left / (b.total || 1));
}

/** Job page: alerts for one invoice or quote (any status), same math as the dashboard and the editor. */
export function profitAlertsForDoc(doc: Doc | null | undefined, minMargin: number): ProfitAlert[] {
  if (!doc || (doc.type !== "invoice" && doc.type !== "proposal")) return [];
  const data = doc.data || {};
  const { total } = docAmounts(doc);
  return profitAlerts({ total, jobCost: r2(ownerJobCost(data)), crewTotal: crewReportTotal(data.crewReport), minMargin, breakdown: jobProfit({ total, data }) });
}

/** This device's cached profile (the account value after loadAccountIntoCache). */
export function cachedMinMargin() {
  try { return readMinMargin(JSON.parse(window.localStorage.getItem("clientready-profile") || "{}")); } catch { return 20; }
}
