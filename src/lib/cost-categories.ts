/**
 * Crew expense categories (crew_add_expense: gas | parts | dump | other) and how each lines up with the
 * owner's job-cost fields. This is a read-only mapping for comparisons and labels; it does not change
 * how job costs are totaled.
 */
export type CrewKind = "gas" | "parts" | "dump" | "other";
export const CREW_KINDS: { kind: CrewKind; label: string }[] = [
  { kind: "gas", label: "Gas / diesel" },
  { kind: "parts", label: "Parts / tools" },
  { kind: "dump", label: "Dump fees" },
  { kind: "other", label: "Other" },
];
export const crewKindLabel = (kind: unknown) => CREW_KINDS.find((item) => item.kind === kind)?.label || String(kind || "Other");

type Fee = { name?: string; amount?: string };
export type CostFields = { parts?: string; gas?: string; tools?: string; lunch?: string; otherFees?: Fee[] };

const num = (value: unknown) => Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
export const isDumpFee = (fee: Fee) => /dump/i.test(fee.name || "");

/** Owner estimate per crew category, with where it comes from on the cost form. Lunch is separate (crew does not log it). */
export function estimateByKind(costs: CostFields) {
  const fees = costs.otherFees || [];
  const dump = fees.filter(isDumpFee);
  const other = fees.filter((fee) => !isDumpFee(fee));
  const sum = (list: Fee[]) => list.reduce((total, fee) => total + num(fee.amount), 0);
  return {
    gas: { amount: num(costs.gas), source: "Gas / diesel" },
    parts: { amount: num(costs.parts) + num(costs.tools), source: "Parts + Job supplies" },
    dump: { amount: sum(dump), source: "Other fees named “dump…”" },
    other: { amount: sum(other), source: "Other fees (not dump)" },
    lunch: { amount: num(costs.lunch), source: "Lunch / meals cost" },
  } as const;
}
