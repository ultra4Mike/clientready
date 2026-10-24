/** Line items as the boxes show them right now. React state can lag a same-tick fill()/paste + blur + Save. */
export type ItemTextField = "description" | "qty" | "rate";
type Box = { value: string; dataset: { itemField?: string; itemIndex?: string } };

export function liveItems<T extends Partial<Record<ItemTextField, string>>>(list: T[], boxes: Box[]): T[] {
  let changed = false;
  const next = list.map((item) => ({ ...item }));
  for (const el of boxes) {
    const row = next[Number(el.dataset.itemIndex)];
    const field = el.dataset.itemField as ItemTextField;
    if (!row || !["description", "qty", "rate"].includes(field)) continue;
    if ((row[field] ?? "") !== el.value) { (row as Record<string, unknown>)[field] = el.value; changed = true; }
  }
  return changed ? next : list;
}
