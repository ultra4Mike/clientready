/**
 * Crew cost categories. The keys match the owner's job-cost fields one to one:
 *   parts -> jobCosts.parts, gas -> jobCosts.gas, tools -> jobCosts.tools (Job supplies), lunch -> jobCosts.lunch,
 *   dump -> other fees named "dump…", other -> the remaining other fees.
 * This file maps and compares; it never changes how job costs are totaled.
 */
export type CrewKind = "parts" | "gas" | "tools" | "dump" | "lunch" | "other";
export const CREW_KINDS: { kind: CrewKind; label: string }[] = [
  { kind: "parts", label: "Materials / parts" },
  { kind: "gas", label: "Gas / diesel" },
  { kind: "tools", label: "Job supplies" },
  { kind: "dump", label: "Dump fees" },
  { kind: "lunch", label: "Lunch / meals" },
  { kind: "other", label: "Other" },
];
const KEYS = CREW_KINDS.map((item) => item.kind as string);
export const isCrewKind = (kind: unknown): kind is CrewKind => KEYS.includes(String(kind));
export const crewKindLabel = (kind: unknown) => CREW_KINDS.find((item) => item.kind === kind)?.label || String(kind || "Other");

/** Best guess for an old single-line report ("Parts, gas, or dump fee you paid" + "What it was"). */
export function inferCrewKind(text: unknown): CrewKind {
  const value = String(text || "").toLowerCase();
  if (/\bdump|landfill|disposal|tipping/.test(value)) return "dump";
  if (/\bgas\b|diesel|fuel|gasoline/.test(value)) return "gas";
  if (/lunch|meal|food|dinner|breakfast/.test(value)) return "lunch";
  if (/bag|blade|glove|supplies|string|trimmer line|tape/.test(value)) return "tools";
  if (/part|material|mulch|lumber|pipe|filter|seed|fertili|rock|gravel|sod|wire|screw|nail/.test(value)) return "parts";
  return "other";
}

export type CostLine = { kind: CrewKind; amount: string; note: string; receipt?: string };
const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

/** Cost lines of a crew job report; old reports (parts_cost + parts_note only) become one inferred line. */
export function readCostLines(draft: { costs?: unknown; parts_cost?: unknown; parts_note?: unknown }): CostLine[] {
  if (Array.isArray(draft.costs) && draft.costs.length) {
    return draft.costs
      .map((raw) => {
        const line = (raw || {}) as Partial<CostLine>;
        return { kind: isCrewKind(line.kind) ? line.kind : "other", amount: num(line.amount) ? num(line.amount).toFixed(2) : "", note: String(line.note || "").slice(0, 300), ...(line.receipt ? { receipt: String(line.receipt) } : {}) } as CostLine;
      })
      .filter((line) => num(line.amount) > 0);
  }
  if (num(draft.parts_cost) > 0) return [{ kind: inferCrewKind(draft.parts_note), amount: num(draft.parts_cost).toFixed(2), note: String(draft.parts_note || "") }];
  return [];
}

/** Summary for the legacy parts_cost / parts_note columns. */
export function legacySummary(lines: CostLine[]) {
  const total = lines.reduce((sum, line) => sum + num(line.amount), 0);
  return { parts_cost: total ? total.toFixed(2) : "", parts_note: lines.map((line) => `${crewKindLabel(line.kind)} $${num(line.amount).toFixed(2)}${line.note ? ` ${line.note}` : ""}`).join("; ").slice(0, 500) };
}

type Fee = { id?: string; name?: string; amount?: string };
export type CostFields = { parts?: string; gas?: string; tools?: string; lunch?: string; otherFees?: Fee[] };

export const isDumpFee = (fee: Fee) => /dump/i.test(fee.name || "");

/** Owner estimate per crew category, with where it comes from on the cost form. */
export function estimateByKind(costs: CostFields) {
  const fees = costs.otherFees || [];
  const dump = fees.filter(isDumpFee);
  const other = fees.filter((fee) => !isDumpFee(fee));
  const sum = (list: Fee[]) => list.reduce((total, fee) => total + num(fee.amount), 0);
  return {
    parts: { amount: num(costs.parts), source: "Parts" },
    gas: { amount: num(costs.gas), source: "Gas / diesel" },
    tools: { amount: num(costs.tools), source: "Job supplies" },
    dump: { amount: sum(dump), source: "Other fees named “dump…”" },
    lunch: { amount: num(costs.lunch), source: "Lunch / meals cost" },
    other: { amount: sum(other), source: "Other fees (not dump)" },
  } as const;
}

/**
 * Owner tap only: the cost fields with one category set to the crew amount. Plain fields are replaced;
 * for fee categories a single matching fee is updated, none adds one, several add an adjustment line,
 * so other fees are never removed. Returns the same object when nothing changes.
 */
export function applyCrewAmount<T extends CostFields>(costs: T, kind: CrewKind, amount: number, newId: () => string): T {
  const value = amount.toFixed(2);
  if (kind === "parts" || kind === "gas" || kind === "tools" || kind === "lunch") return { ...costs, [kind]: value };
  const fees = costs.otherFees || [];
  const matching = fees.filter((fee) => (kind === "dump" ? isDumpFee(fee) : !isDumpFee(fee)));
  const current = matching.reduce((total, fee) => total + num(fee.amount), 0);
  if (Math.abs(current - amount) < 0.005) return costs;
  const name = kind === "dump" ? "Dump fee" : "Crew other costs";
  if (matching.length === 1) return { ...costs, otherFees: fees.map((fee) => (fee === matching[0] ? { ...fee, amount: value } : fee)) };
  if (!matching.length) return { ...costs, otherFees: [...fees, { id: newId(), name, amount: value }] };
  return { ...costs, otherFees: [...fees, { id: newId(), name: `${name} (crew adjustment)`, amount: (amount - current).toFixed(2) }] };
}
