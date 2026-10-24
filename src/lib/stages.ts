import { bizToday } from "./biz-today";
/**
 * Progress billing: optional payment stages on one invoice (data.stages). Stages only split the
 * invoice total into a schedule; they never change items, totals or payments. Payments recorded
 * on the invoice are applied to the stages in order (deposit first).
 */
export type StageKind = "deposit" | "progress" | "final";
export type Stage = { id: string; label: string; kind: StageKind; mode: "percent" | "amount"; value: string; dueDate: string };
export type StageRow = Stage & { amount: number; paid: number; remaining: number; state: "paid" | "due" | "overdue" | "upcoming" };

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
const round = (value: number) => Math.round(value * 100) / 100;

/** One wording everywhere: once something is paid and money is still owed, it is the "Remaining balance". */
export function balanceLabel(paid: number, balance: number) {
  return paid > 0.004 && balance > 0.004 ? "Remaining balance" : "Still owed";
}

/**
 * One-tap progress billing: a deposit due today, the rest due on the invoice due date.
 * R57: when money is already paid (e.g. a proposal deposit carried to the invoice), the deposit stage IS
 * that paid amount (not a new 30%), so the stages show "Deposit (paid) $50" + "Remaining balance".
 */
export function depositRemainderStages(percent = 30, today = "", dueDate = "", alreadyPaid = 0): Stage[] {
  const id = `${Date.now()}`;
  const paid = round(Math.max(alreadyPaid, 0));
  const deposit: Stage = paid > 0.004
    ? { id: `${id}-d`, label: "Deposit (paid)", kind: "deposit", mode: "amount", value: paid.toFixed(2), dueDate: "" }
    : { id: `${id}-d`, label: "Deposit", kind: "deposit", mode: "percent", value: String(percent), dueDate: today };
  return [
    deposit,
    // R33: the remainder is due on the invoice due date, so it can go overdue.
    { id: `${id}-f`, label: "Remaining balance", kind: "final", mode: "percent", value: "", dueDate: dueDate || "" },
  ];
}

export const STAGE_KIND_LABEL: Record<StageKind, string> = { deposit: "Deposit", progress: "Progress", final: "Final" };

export function readStages(value: unknown): Stage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((stage) => stage && typeof stage === "object")
    .map((stage, index) => {
      const raw = stage as Partial<Stage>;
      const kind: StageKind = raw.kind === "deposit" || raw.kind === "final" ? raw.kind : "progress";
      return {
        id: String(raw.id || `stage-${index}`),
        label: String(raw.label || ""),
        kind,
        mode: raw.mode === "amount" ? "amount" : "percent",
        value: String(raw.value ?? ""),
        dueDate: String(raw.dueDate || ""),
      };
    });
}

/** Dollar amount of each stage. A final stage left blank takes whatever the others leave. */
export function stageAmounts(total: number, stages: Stage[]) {
  const fixed = stages.map((stage) =>
    stage.kind === "final" && stage.value.trim() === "" ? null : round(stage.mode === "percent" ? (total * Math.max(num(stage.value), 0)) / 100 : Math.max(num(stage.value), 0)),
  );
  const used = fixed.reduce<number>((sum, amount) => sum + (amount || 0), 0);
  return fixed.map((amount) => (amount === null ? round(Math.max(total - used, 0)) : amount));
}

/**
 * The schedule with what is paid against each stage. `balance` is the invoice's still-owed amount
 * (so an older invoice marked paid without payment amounts counts as fully paid).
 */
/** R57 (live): a deposit stage that's fully paid reads "Deposit (paid)" (custom names are kept). */
export function stageName(row: { label: string; kind: StageKind; state?: string }) {
  const base = row.label || STAGE_KIND_LABEL[row.kind];
  return row.state === "paid" && row.kind === "deposit" && /^deposit$/i.test(base.trim()) ? "Deposit (paid)" : base;
}

export function stagePlan(total: number, balance: number, stages: Stage[], today: string, opts: { jobDone?: boolean } = {}) {
  const amounts = stageAmounts(total, stages);
  let pool = round(Math.max(total - balance, 0));
  let currentFound = false;
  const rows: StageRow[] = stages.map((stage, index) => {
    const amount = amounts[index];
    const paid = round(Math.min(pool, amount));
    pool = round(pool - paid);
    const remaining = round(amount - paid);
    let state: StageRow["state"] = "upcoming";
    if (remaining <= 0.004) state = "paid";
    else if (!currentFound) {
      currentFound = true;
      // R128: a final payment with no date is due when the job is done, not "due now" before that.
      const waitsForJob = !stage.dueDate && stage.kind === "final" && index > 0 && !opts.jobDone;
      state = stage.dueDate && stage.dueDate < today ? "overdue" : waitsForJob ? "upcoming" : !stage.dueDate || stage.dueDate <= today ? "due" : "upcoming";
    } else if (stage.dueDate && stage.dueDate < today) state = "overdue";
    return { ...stage, amount, paid, remaining, state };
  });
  const planned = round(amounts.reduce((sum, amount) => sum + amount, 0));
  const current = rows.find((row) => row.state !== "paid") || null;
  return { rows, planned, mismatch: round(total - planned), current };
}

/** What a "pay now" should charge: the current stage's remainder (never above the balance), or the balance. */
export function payNowAmount(total: number, balance: number, stages: Stage[], today: string, full = false, opts: { jobDone?: boolean } = {}) {
  if (full || !stages.length) return balance;
  const { current } = stagePlan(total, balance, stages, today, opts);
  return current ? round(Math.min(current.remaining, balance)) : balance;
}

/** Overdue fix: when the invoice due date moves, final stages that were on the old due date (or blank) move with it. */
export function followDueDate(stages: Stage[], prev: string, next: string): Stage[] {
  if (!prev || !next || prev === next) return stages;
  let changed = false;
  const out = stages.map((stage) => (stage.kind === "final" && stage.dueDate === prev ? ((changed = true), { ...stage, dueDate: next }) : stage));
  return changed ? out : stages;
}

export function todayYmd() {
  return bizToday();
}

export type PlanEvery = "week" | "2weeks" | "month";

function addPeriod(ymd: string, every: PlanEvery, times: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (every === "month") {
    const target = new Date(Date.UTC(y, m - 1 + times, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target.toISOString().slice(0, 10);
  }
  date.setUTCDate(date.getUTCDate() + times * (every === "week" ? 7 : 14));
  return date.toISOString().slice(0, 10);
}

/**
 * Payment plan: splits what is still owed into `count` equal payments (2-24), the first due on `firstDue`
 * and then every week / 2 weeks / month. Money already paid becomes a "Paid so far" stage so payments
 * keep applying in order. Only builds stages (data.stages); totals, items and payments never change.
 */
export function installmentStages(total: number, balance: number, count: number, firstDue: string, every: PlanEvery, newId: (i: number) => string = (i) => `plan-${Date.now()}-${i}`): Stage[] {
  const n = Math.min(24, Math.max(2, Math.floor(count) || 2));
  const paidSoFar = round(Math.max(total - balance, 0));
  const each = Math.floor((balance / n) * 100) / 100;
  const out: Stage[] = [];
  if (paidSoFar > 0.004) out.push({ id: newId(-1), label: "Paid so far", kind: "deposit", mode: "amount", value: paidSoFar.toFixed(2), dueDate: "" });
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    out.push({ id: newId(i), label: `Payment ${i + 1} of ${n}`, kind: last ? "final" : "progress", mode: "amount", value: last ? "" : each.toFixed(2), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(firstDue) ? addPeriod(firstDue, every, i) : "" });
  }
  return out;
}

/* ---- Display only: clear stage math for the owner editor (nothing stored or calculated differently). ---- */
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortYmd = (ymd: string) => { const [, m, d] = ymd.split("-").map(Number); return m && d ? `${MON[m - 1]} ${d}` : ymd; };

/** "Invoice total $1,000.00 · Stages add up to $1,000.00 (100%) · Paid $250.00 · Still owed $750.00", plus warn when off. */
export function stageSummary(total: number, balance: number, stages: Stage[]) {
  const planned = round(stageAmounts(total, stages).reduce((sum, amount) => sum + amount, 0));
  const pct = total > 0.004 ? Math.round((planned / total) * 1000) / 10 : 0;
  const paid = round(Math.max(total - balance, 0));
  const text = `Invoice total ${usd(total)} · Stages add up to ${usd(planned)} (${pct}%) · Paid ${usd(paid)} · Still owed ${usd(Math.max(balance, 0))}`;
  const off = round(total - planned);
  const warn = Math.abs(off) > 0.004 ? `Stages add up to ${pct}% of the invoice total, ${off > 0 ? `${usd(off)} not scheduled` : `${usd(-off)} too much`}.` : "";
  return { text, warn, planned, pct, paid };
}

/** "$300.00 · $250.00 paid · $50.00 left · Due Oct 25", "$400.00 · $400.00 left · Due Oct 28", or "$300.00 · Paid in full". */
export function stageRowText(row: Pick<StageRow, "amount" | "paid" | "remaining" | "dueDate" | "state">) {
  const parts = [usd(row.amount)];
  if (row.state === "paid" || row.remaining <= 0.004) return `${parts[0]} · Paid in full`;
  if (row.paid > 0.004) parts.push(`${usd(row.paid)} paid`);
  parts.push(`${usd(row.remaining)} left`);
  if (row.state === "due") parts.push(row.dueDate ? `Due now (${shortYmd(row.dueDate)})` : "Due now");
  else if (row.dueDate) parts.push(`Due ${shortYmd(row.dueDate)}`);
  if (row.state === "overdue") parts.push("Overdue");
  return parts.join(" · ");
}

/** Owner preference: stages in fixed $ by default. Turns percent stages into their $ amount (blank "rest" finals stay blank). Only used for new stages or a stage the owner edits. */
export function asAmountStage(stage: Stage, amount: number): Stage {
  if (stage.mode === "amount") return stage;
  if (stage.kind === "final" && stage.value.trim() === "") return { ...stage, mode: "amount" };
  return { ...stage, mode: "amount", value: round(amount).toFixed(2) };
}

/** QA2: the deposit % of the proposal an invoice was made from (0 = none, use the default). */
export function sourceDepositPercent(fromProposal: { id?: string; depositPercent?: unknown } | null | undefined, docs: { id?: string; type?: string; data?: Record<string, unknown> }[]) {
  const ok = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return n > 0 && n < 100 ? n : 0; };
  if (!fromProposal?.id) return 0;
  const own = ok(fromProposal.depositPercent);
  if (own) return own;
  const proposal = docs.find((doc) => doc.id === fromProposal.id);
  return proposal ? ok(proposal.data?.depositPercent) : 0;
}
