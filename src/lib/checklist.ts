/** Job-complete checklist (owner writes it in the schedule; assigned crew tick it before "Done"). */
export type ChecklistItem = { id: string; text: string; done?: boolean; doneBy?: string; doneAt?: string };

export const MAX_CHECKLIST = 20;

export function readChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw, index) => {
      const item = (raw || {}) as Partial<ChecklistItem>;
      return {
        id: String(item.id || `c${index}`),
        text: String(item.text || "").trim().slice(0, 120),
        ...(item.done ? { done: true } : {}),
        ...(item.done && item.doneBy ? { doneBy: String(item.doneBy).slice(0, 80) } : {}),
        ...(item.done && item.doneAt ? { doneAt: String(item.doneAt) } : {}),
      };
    })
    .filter((item) => item.text)
    .slice(0, MAX_CHECKLIST);
}

/** One item per line; lines that match an existing item (same text) keep its id and ticked state. */
export function checklistFromLines(text: string, previous: ChecklistItem[] = []) {
  const byText = new Map(previous.map((item) => [item.text.toLowerCase(), item]));
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const line of text.split("\n").map((part) => part.replace(/^\s*[-*•\[\]x ]*\s*/i, "").trim().slice(0, 120)).filter(Boolean)) {
    const key = line.toLowerCase();
    if (seen.has(key) || out.length >= MAX_CHECKLIST) continue;
    seen.add(key);
    out.push(byText.get(key) || { id: `c${Date.now().toString(36)}${out.length}${Math.random().toString(36).slice(2, 5)}`, text: line });
  }
  return out;
}

export function checklistProgress(items: ChecklistItem[]) {
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length, complete: done === items.length };
}

/** Items not ticked yet, in order. */
export function checklistMissing(items: ChecklistItem[]) {
  return items.filter((item) => !item.done);
}

/** True when an item asks for a photo (it is completed with the job photos). */
export function checklistNeedsPhoto(item: Pick<ChecklistItem, "text">) {
  return /\b(photos?|pictures?|pics?|snapshots?|images?)\b/i.test(item.text);
}

/** "Needs completing: A, B" (or "" when complete). */
export function checklistNote(items: ChecklistItem[]) {
  const missing = checklistMissing(items);
  return missing.length ? `Needs completing: ${missing.map((item) => item.text).join(", ")}` : "";
}

/** Link from a calendar badge straight to the document's checklist. */
export function checklistHref(docId: string) {
  return `/invoice?id=${encodeURIComponent(docId)}&focus=checklist#checklist`;
}

/** Whether a URL search string asks to focus the checklist. */
export function wantsChecklistFocus(search: string) {
  return new URLSearchParams(search).get("focus") === "checklist";
}

/** QA4: the owner ticks (or unticks) an item on the job page; ticks record who and when. */
export function toggleChecklistItem(items: ChecklistItem[], id: string, by: string, at = new Date().toISOString()): ChecklistItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    if (item.done) { const { done: _d, doneBy: _b, doneAt: _a, ...rest } = item; void _d; void _b; void _a; return rest as ChecklistItem; }
    return { ...item, done: true, doneBy: by, doneAt: at };
  });
}

/** QA4: the warning shown before marking a job Done with unticked items, or "" when all are ticked. */
export function doneChecklistWarning(items: ChecklistItem[]): string {
  const left = checklistMissing(items);
  return left.length ? `${left.length} checklist item${left.length === 1 ? " is" : "s are"} not ticked: ${left.map((item) => item.text).join(", ")}. Mark the job done anyway?` : "";
}
