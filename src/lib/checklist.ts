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
