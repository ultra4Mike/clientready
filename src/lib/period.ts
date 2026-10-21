// Day / Week / Month / Year / All-time ranges (local dates, YYYY-MM-DD). "all" has no limits ("" .. "").
export type PeriodRange = "day" | "week" | "month" | "year" | "all";
export const PERIODS: { range: PeriodRange; label: string }[] = [
  { range: "day", label: "Day" }, { range: "week", label: "Week" }, { range: "month", label: "Month" }, { range: "year", label: "Year" }, { range: "all", label: "All time" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function periodRange(range: PeriodRange, day = new Date()): { from: string; to: string } {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (range === "day") return { from: ymd(d), to: ymd(d) };
  if (range === "week") {
    const start = new Date(d); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (range === "month") return { from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  if (range === "year") return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  return { from: "", to: "" };
}

export function inPeriod(date: string, from: string, to: string) {
  if (!from && !to) return true;
  return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}
