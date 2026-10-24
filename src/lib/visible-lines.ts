/** QA4: the client never sees blank lines (no description and no amount). */
export function visibleLines<T extends { description?: string; qty?: string; rate?: string }>(items: T[]): T[] {
  return items.filter((item) => {
    const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    return String(item.description ?? "").trim() !== "" || Math.abs(amount) > 0.004;
  });
}
