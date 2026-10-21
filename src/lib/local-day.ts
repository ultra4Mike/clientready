/** B3: plain dates stay as typed; full timestamps (approvedAt, paidAt) show the viewer's local day, not UTC. */
export const localDayOf = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  if (!/T\d{2}:\d{2}/.test(value)) return value.slice(0, 10);
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value.slice(0, 10);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
};
