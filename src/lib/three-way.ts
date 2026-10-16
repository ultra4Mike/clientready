/**
 * Conflict-free document sync: a three-way merge of a document's data against the last copy this
 * device saw from the cloud ("base"). Each side keeps what only it changed:
 * - top-level fields: changed on one side only -> that side wins; changed on both -> this device's
 *   newer save wins and the field is reported in `conflicts`;
 * - lists of objects with an `id` (items, payments, photos, ...) merge per entry: adds from both sides
 *   are kept, an entry deleted on one side stays deleted unless the other side edited it, and edits to
 *   different fields of the same entry are combined.
 * Bases are stored per document with long strings (photos) reduced to a fingerprint.
 */
type Json = unknown;
type Data = Record<string, Json>;

const BASE_KEY = "clientready-doc-base";
const SKIP = new Set(["updatedAt"]);

function fingerprint(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return `#fp:${text.length}:${(hash >>> 0).toString(36)}`;
}

/** Same value with long strings (data URLs) fingerprinted; used for storage and comparisons. */
export function slim(value: Json): Json {
  if (typeof value === "string") return value.length > 512 ? fingerprint(value) : value;
  if (Array.isArray(value)) return value.map(slim);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Data).map(([key, item]) => [key, slim(item)]));
  return value;
}

function stable(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Data).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Data)[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

const same = (a: Json, b: Json) => stable(slim(a)) === stable(slim(b));

const isIdList = (value: Json): value is Data[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Data).id === "string" && (item as Data).id !== "");

function mergeObjects(base: Data, mine: Data, theirs: Data, path: string, conflicts: string[]): Data {
  const out: Data = {};
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base)]);
  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const merged = mergeValue(base[key], mine[key], theirs[key], path ? `${path}.${key}` : key, conflicts);
    if (merged !== undefined) out[key] = merged;
  }
  return out;
}

function mergeLists(base: Data[], mine: Data[], theirs: Data[], path: string, conflicts: string[]): Data[] {
  const byId = (list: Data[]) => new Map(list.map((item) => [String(item.id), item]));
  const b = byId(base), m = byId(mine), t = byId(theirs);
  const order: string[] = [];
  for (const item of mine) order.push(String(item.id));
  // Entries only the other device has go where they sit in its list (after their predecessor).
  theirs.forEach((item, index) => {
    const id = String(item.id);
    if (order.includes(id)) return;
    const before = index > 0 ? String(theirs[index - 1].id) : "";
    const at = before ? order.indexOf(before) : -1;
    order.splice(at + 1, 0, id);
  });
  const out: Data[] = [];
  for (const id of order) {
    const was = b.get(id), a = m.get(id), c = t.get(id);
    if (a && c) out.push(was ? (mergeObjects(was, a, c, `${path}[${id}]`, conflicts)) : (same(a, c) ? a : (conflicts.push(`${path}[${id}]`), a)));
    else if (a && !c) { if (!was || !same(was, a)) out.push(a); } // they deleted it: keep only if I edited/added it
    else if (c && !a) { if (!was || !same(was, c)) out.push(c); } // I deleted it: keep only if they edited/added it
  }
  return out;
}

function mergeValue(base: Json, mine: Json, theirs: Json, path: string, conflicts: string[]): Json {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  const listy = (value: Json) => value === undefined || (Array.isArray(value) && (value.length === 0 || isIdList(value)));
  if ((isIdList(mine) || isIdList(theirs)) && listy(mine) && listy(theirs) && listy(base)) {
    return mergeLists((base as Data[]) || [], (mine as Data[]) || [], (theirs as Data[]) || [], path, conflicts);
  }
  const plain = (value: Json) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (plain(mine) && plain(theirs) && (base === undefined || plain(base))) return mergeObjects((base as Data) || {}, mine as Data, theirs as Data, path, conflicts);
  conflicts.push(path);
  return mine;
}

/** True when two versions of document data are the same apart from their save stamp. */
export function sameData(a: Data, b: Data) {
  const strip = (value: Data) => { const copy = { ...(value || {}) }; delete copy.updatedAt; return copy; };
  return same(strip(a), strip(b));
}

/** Three-way merge of document data; returns the merged data and which fields both sides changed. */
export function mergeData(base: Data, mine: Data, theirs: Data) {
  const conflicts: string[] = [];
  const merged = mergeObjects(base || {}, mine || {}, theirs || {}, "", conflicts);
  if (mine?.updatedAt !== undefined || theirs?.updatedAt !== undefined) {
    merged.updatedAt = String(mine?.updatedAt || "") > String(theirs?.updatedAt || "") ? mine.updatedAt : theirs.updatedAt;
  }
  return { data: merged, conflicts };
}

/** Real (unslimmed) values come from mine/theirs; slimmed bases only decide who changed what. */
function readBases(): Record<string, Data> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(BASE_KEY) || "{}") as Record<string, Data>;
  } catch {
    return {};
  }
}

export function readBase(id: string): Data | null {
  return readBases()[id] || null;
}

export function writeBases(entries: { id: string; data: Data | null | undefined }[]) {
  if (typeof window === "undefined" || !entries.length) return;
  const all = readBases();
  for (const { id, data } of entries) {
    if (data) all[id] = slim(data) as Data;
    else delete all[id];
  }
  try {
    window.localStorage.setItem(BASE_KEY, JSON.stringify(all));
  } catch {
    // storage full: merges fall back to newest-wins for these documents
  }
}

export const DOC_BASE_KEY = BASE_KEY;
