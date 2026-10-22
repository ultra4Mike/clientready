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
export const crewKindLabel = (kind: unknown) => (isFeeKind(kind) ? feeName(kind) : CREW_KINDS.find((item) => item.kind === kind)?.label || String(kind || "Other"));

/**
 * The owner's own cost lines (custom "other fees" with a name) as crew categories: "fee:<name>".
 * Only names travel to crew (crew_jobs.cost_lines), never amounts.
 */
export type CostKey = CrewKind | `fee:${string}`;
export const isFeeKind = (kind: unknown): kind is `fee:${string}` => /^fee:[\s\S]{1,60}$/.test(String(kind || ""));
export const feeName = (kind: unknown) => String(kind || "").slice(4);
export const isCostKey = (kind: unknown): kind is CostKey => isCrewKind(kind) || isFeeKind(kind);
/** Generic fee names the app itself makes for "Other" (not a custom owner line). */
const GENERIC_FEE = /^(crew other costs|other)( \(crew adjustment\))?$/i;
export const isCustomFee = (fee: { name?: string }) => Boolean((fee.name || "").trim()) && !isDumpFee(fee) && !GENERIC_FEE.test((fee.name || "").trim()) && !/^extra: /i.test((fee.name || "").trim());
/** Names of the owner's custom cost lines on one job (deduped, trimmed, max 60 chars, max 20). No prices. */
export function customCostLineNames(costs: { otherFees?: { name?: string }[] } | undefined) {
  const out: string[] = [];
  for (const fee of costs?.otherFees || []) {
    const name = (fee.name || "").trim().slice(0, 60);
    if (isCustomFee({ name }) && !out.some((n) => n.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 20);
}

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

export type CostLine = { kind: CostKey; amount: string; note: string; receipt?: string };
const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;

/** Cost lines of a crew job report; old reports (parts_cost + parts_note only) become one inferred line. */
export function readCostLines(draft: { costs?: unknown; parts_cost?: unknown; parts_note?: unknown }): CostLine[] {
  if (Array.isArray(draft.costs) && draft.costs.length) {
    return draft.costs
      .map((raw) => {
        const line = (raw || {}) as Partial<CostLine>;
        return { kind: isCostKey(line.kind) ? line.kind : "other", amount: num(line.amount) ? num(line.amount).toFixed(2) : "", note: String(line.note || "").slice(0, 300), ...(line.receipt ? { receipt: String(line.receipt) } : {}) } as CostLine;
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
  // Custom owner lines have their own rows (customFeeEstimates), so "Other" holds only the generic fees.
  const generic = other.filter((fee) => !isCustomFee(fee));
  return {
    parts: { amount: num(costs.parts), source: "Parts" },
    gas: { amount: num(costs.gas), source: "Gas / diesel" },
    tools: { amount: num(costs.tools), source: "Job supplies" },
    dump: { amount: sum(dump), source: "Other fees named “dump…”" },
    lunch: { amount: num(costs.lunch), source: "Lunch / meals cost" },
    other: { amount: sum(generic), source: "Other fees (not dump, not your own named lines)" },
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

/** Owner picker order (Materials first, type required). Labels match the owner's cost lines. */
export const CREW_TYPE_CHOICES: { kind: CrewKind; label: string }[] = [
  { kind: "parts", label: "Materials" },
  { kind: "gas", label: "Fuel" },
  { kind: "tools", label: "Equipment / supplies" },
  { kind: "dump", label: "Dump fees" },
  { kind: "lunch", label: "Meals" },
  { kind: "other", label: "Other" },
];
export const crewTypeLabel = (kind: unknown) => (isFeeKind(kind) ? feeName(kind) : CREW_TYPE_CHOICES.find((item) => item.kind === kind)?.label || "Other");

/** "Check type": the note reads like materials/supplies but the line is filed as fuel (e.g. Gas + "shingles, nails"). */
export function crewTypeMismatch(kind: unknown, note: unknown): CrewKind | null {
  if (isFeeKind(kind)) return null; // the owner's own named line, picked by the crew from the owner's list
  // Legacy / unknown types (and "Other") map to the closest owner line from the note, flagged until the owner confirms.
  if (!isCrewKind(kind) || kind === "other") { const guess = inferCrewKind(note); return guess !== "other" ? guess : null; }
  if (kind !== "gas") return null;
  const text = String(note || "").toLowerCase();
  if (/\bgas\b|diesel|fuel|gasoline/.test(text)) return null;
  if (/shingle|nail|lumber|wood|plywood|board|screw|bolt|pipe|wire|cement|concrete|mortar|gravel|rock|sod|mulch|seed|fertili|paint|caulk|drywall|insulation|tile|brick|roofing|flashing|material|part\b|parts\b|hardware/.test(text)) return "parts";
  if (/glove|blade|bag|tape|trimmer line|supplies|tool|rental/.test(text)) return "tools";
  return null;
}

/** What one crew apply changed, so the owner can undo it (restores the owner's previous value). */
export type CrewApplyUndo = { kind: CostKey; at: string; /** set for "Extra item" lines added as their own cost line */ rowId?: string; before: { field?: string; otherFees?: Fee[] } };
export function crewApplySnapshot(costs: CostFields, kind: CostKey): CrewApplyUndo {
  const plain = kind === "parts" || kind === "gas" || kind === "tools" || kind === "lunch";
  return { kind, at: new Date().toISOString(), before: plain ? { field: String((costs as Record<string, unknown>)[kind] ?? "") } : { otherFees: (costs.otherFees || []).map((fee) => ({ ...fee })) } };
}
export function undoCrewApply<T extends CostFields>(costs: T, undo: CrewApplyUndo): T {
  if (undo.before.otherFees) return { ...costs, otherFees: undo.before.otherFees.map((fee) => ({ ...fee })) };
  return { ...costs, [undo.kind]: undo.before.field ?? "" };
}
export function readCrewUndo(value: unknown): CrewApplyUndo[] {
  return Array.isArray(value) ? (value.filter((u) => u && typeof u === "object" && isCostKey((u as CrewApplyUndo).kind) && (u as CrewApplyUndo).before) as CrewApplyUndo[]) : [];
}

/** Crew "Extra item (not in estimate)" purchases are saved with this note prefix (no new column needed). */
export const EXTRA_PREFIX = "Extra item: ";
export const isExtraItem = (note: unknown) => /^extra item:/i.test(String(note || "").trim());
export const extraName = (note: unknown) => String(note || "").trim().replace(/^extra item:\s*/i, "") || "Extra item";

/** Owner estimate for each custom cost line, keyed "fee:<name>". */
export function customFeeEstimates(costs: CostFields) {
  const out = new Map<string, number>();
  for (const fee of costs.otherFees || []) if (isCustomFee(fee)) { const key = `fee:${(fee.name || "").trim().slice(0, 60)}`; out.set(key, (out.get(key) || 0) + num(fee.amount)); }
  return out;
}

/** Owner tap only: set a custom cost line to the crew amount (first fee with that name; others untouched). */
export function applyFeeAmount<T extends CostFields>(costs: T, key: string, amount: number): T {
  const name = feeName(key).toLowerCase();
  const fees = costs.otherFees || [];
  const index = fees.findIndex((fee) => (fee.name || "").trim().slice(0, 60).toLowerCase() === name);
  if (index < 0) return costs;
  const same = fees.filter((fee, i) => i !== index && (fee.name || "").trim().slice(0, 60).toLowerCase() === name).reduce((t, f) => t + num(f.amount), 0);
  return { ...costs, otherFees: fees.map((fee, i) => (i === index ? { ...fee, amount: Math.max(amount - same, 0).toFixed(2) } : fee)) };
}
