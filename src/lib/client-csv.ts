/** R106: clients CSV (export columns = import columns). Pure. */
export const CLIENT_CSV_HEADER = ["Name", "Company", "Email", "Phone", "Address", "Notes", "Preferences"];

/** RFC-4180-ish parser: quotes, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type ImportedClient = { name: string; company: string; email: string; phone: string; address: string; notes: string; preferences: string };

/** Rows -> clients by header name (case-insensitive). Rows without a name are skipped; names already saved are skipped. */
export function clientsFromCsv(text: string, existingNames: string[]) {
  const [header = [], ...rows] = parseCsv(text);
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = { name: col("Name"), company: col("Company"), email: col("Email"), phone: col("Phone"), address: col("Address"), notes: col("Notes"), preferences: col("Preferences") };
  const seen = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const added: ImportedClient[] = []; let skipped = 0;
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? String(r[i] || "").trim() : "");
    const client = { name: get(idx.name), company: get(idx.company), email: get(idx.email), phone: get(idx.phone), address: get(idx.address), notes: get(idx.notes), preferences: get(idx.preferences) };
    if (!client.name || seen.has(client.name.toLowerCase())) { skipped += 1; continue; }
    seen.add(client.name.toLowerCase()); added.push(client);
  }
  return { added, skipped, missingName: idx.name < 0 };
}
