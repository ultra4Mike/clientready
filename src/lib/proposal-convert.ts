/**
 * R128: approving a proposal turns it into an invoice automatically (no manual convert). Pure: the
 * route in /api/approve/convert loads and saves. The proposal record is kept as it is.
 * - The invoice copies what describes the work and the client (same as Duplicate) plus the costs.
 * - A requested deposit becomes the first payment stage, due on approval (today); the rest is due when
 *   the job is done (final stage with no date). The deposit is paid on the INVOICE, so it counts once.
 * - The invoice carries an already-approved customer link so the client can pay without a second approval.
 */
import { copyDocData } from "./doc-copy";
import { nextFreeNumber } from "./doc-numbers";
import type { Stage } from "./stages";

type Doc = { id: string; type: string; title?: string; data?: Record<string, unknown> };

export function depositPercentOf(data: Record<string, unknown> | undefined) {
  const n = Number(String(data?.depositPercent ?? "").replace(/[^0-9.]/g, ""));
  return n > 0 && n < 100 ? n : 0;
}

export function conversionStages(percent: number, today: string, stamp = `${Date.now()}`): Stage[] {
  if (!percent) return [];
  return [
    { id: `${stamp}-d`, label: "Deposit", kind: "deposit", mode: "percent", value: String(percent), dueDate: today },
    { id: `${stamp}-f`, label: "Balance when the job is done", kind: "final", mode: "percent", value: "", dueDate: "" },
  ];
}

export function invoiceFromProposal(proposal: Doc, ownerDocs: Doc[], opts: { today: string; token: string; approval: Record<string, unknown> | null }) {
  const pdata = proposal.data || {};
  const like = ownerDocs.filter((d) => d.type === "invoice").map((d) => String(d.data?.invoiceNumber || "")).find(Boolean) || "INV-1000";
  const number = nextFreeNumber(ownerDocs as never, "invoice", like);
  const percent = depositPercentOf(pdata);
  const base = copyDocData(pdata, number, opts.today, "");
  delete (base as Record<string, unknown>).depositPercent;
  const data: Record<string, unknown> = {
    ...base,
    status: "sent",
    // Balance is due when the job is done, not on a calendar date the client was never given.
    dueDate: "",
    dueOnCompletion: true,
    stages: conversionStages(percent, opts.today),
    ...(pdata.jobCosts ? { jobCosts: pdata.jobCosts } : {}),
    ...(pdata.crew ? { crew: pdata.crew } : {}),
    ...(pdata.jobStart ? { jobStart: pdata.jobStart } : {}),
    ...(pdata.jobEnd ? { jobEnd: pdata.jobEnd } : {}),
    ...(pdata.schedule ? { schedule: pdata.schedule } : {}),
    proposalSignature: (opts.approval?.signature as unknown) || pdata.signature || null,
    fromProposal: { id: proposal.id, number: String(pdata.invoiceNumber || proposal.title || "Proposal"), depositApplied: true, auto: true },
    approval: { ...(opts.approval || {}), token: opts.token, status: "approved", viaProposal: true },
    autoConverted: { at: new Date().toISOString(), from: proposal.id },
  };
  return { number, data };
}

/** Owner opt-in: email the new invoice to the client only when this switch is on (off by default). */
export const autoEmailOn = (profile: Record<string, unknown> | null | undefined) => profile?.autoEmailConvertedInvoice === true;
