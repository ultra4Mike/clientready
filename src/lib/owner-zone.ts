/**
 * QA3: the public approve/portal pages show times in the OWNER's business zone (saved on the document as
 * businessTimezone when the owner saves it), never the server's or a hard-coded zone. Default America/Chicago.
 */
export function ownerZone(value: unknown) {
  const zone = String(value || "");
  if (!zone) return "America/Chicago";
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return zone; } catch { return "America/Chicago"; }
}
