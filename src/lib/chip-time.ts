/**
 * Retest bug 6: calendar chips show the job's start AND end, short enough for a 390px week cell:
 * "9:00-1:00 PM" (one AM/PM, on the end), "9:00 PM-1:00 AM" when it runs past midnight, "9:00 AM" with no end.
 */
const parts = (time: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m) return null;
  const h = Number(m[1]), min = m[2];
  return { text: `${h % 12 || 12}:${min}`, pm: h >= 12 };
};
export function chipTimeRange(start?: string, end?: string) {
  const s = parts(start || "");
  if (!s) return "";
  const e = parts(end || "");
  if (!e || end === start) return `${s.text} ${s.pm ? "PM" : "AM"}`;
  const overnight = (end || "") < (start || "");
  return `${s.text}${overnight ? ` ${s.pm ? "PM" : "AM"}` : ""}-${e.text} ${e.pm ? "PM" : "AM"}`;
}
