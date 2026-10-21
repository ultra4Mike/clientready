/** The reason a crew member typed in "Fix time" ("" when none or only the owner edited it). */
export function crewFixReason(entry: { edited_reason?: string | null } | null | undefined) {
  const text = String(entry?.edited_reason || "").replace(/\s*·?\s*Edited by owner$/, "").trim();
  return text;
}
