/** Help search: every query word must match. Words of 4+ letters also match a word one typo away (edit distance ≤ 1, a swap of two neighbor letters counts as one). */
export function withinOneEdit(a: string, b: string) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; continue; }
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

export function helpMatches(text: string, query: string) {
  const hay = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  let tokens: string[] | null = null;
  return words.every((w) => {
    if (hay.includes(w)) return true;
    if (w.length < 4) return false;
    tokens ??= hay.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    // also allow a typo in the start of a longer word ("invioce" → "invoices")
    return tokens.some((t) => withinOneEdit(w, t) || (t.length > w.length && withinOneEdit(w, t.slice(0, w.length))));
  });
}
