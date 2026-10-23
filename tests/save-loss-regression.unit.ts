// Retest bug 4 regression: INV-1011 saved as Sent $350 came back as Draft $300. A background sync / schedule write
// had read the Draft $300 copy before the save and re-saved it after (with a fresh stamp), winning the merge.
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } };
import { mergeData, readAncestor, readBase, writeBases } from "@/lib/three-way";
import { keepNewerLocal, writeLocalDocsKeepingNewer, DOCS_KEY } from "@/lib/doc-sync";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };

const draft = { status: "draft", items: [{ id: "a", price: "300" }], updatedAt: "2026-10-23T10:00:00.000Z" };
const sent = { status: "sent", items: [{ id: "a", price: "350" }], updatedAt: "2026-10-23T10:01:00.000Z" };
writeBases([{ id: "inv1011", data: draft }]);
writeBases([{ id: "inv1011", data: sent }]); // the user's save landed
ok(readBase("inv1011")?.status === "sent", "base is the newest synced version");
const ancestor = readAncestor("inv1011", draft.updatedAt);
ok(ancestor?.status === "draft", "the version the stale copy was read from is still known");
// Old behaviour: base = newest (sent) -> the stale copy differs from it and wins.
const oldWay = mergeData(sent, { ...draft, updatedAt: "2026-10-23T10:02:00.000Z" }, sent).data;
ok(oldWay.status === "draft", "(documents the bug) merging against the newest base lets the stale copy win");
// New behaviour: base = the ancestor -> the stale copy changed nothing, the Sent $350 save is kept.
const fixed = mergeData(ancestor!, { ...draft, updatedAt: "2026-10-23T10:02:00.000Z" }, sent).data as typeof sent;
ok(fixed.status === "sent" && fixed.items[0].price === "350", "stale re-save keeps Sent $350");
// A real change in the stale writer (e.g. the schedule) still goes through.
const withPin = mergeData(ancestor!, { ...draft, pin: { lat: 1 } }, sent).data as Record<string, unknown>;
ok(withPin.status === "sent" && Boolean(withPin.pin), "what the stale writer really changed is still applied");

// Local list: a sync result never overwrites a doc saved on this device meanwhile.
const stale = [{ id: "inv1011", data: draft }, { id: "x", data: { updatedAt: "2026-10-23T09:00:00.000Z" } }];
const current = [{ id: "inv1011", data: sent }, { id: "x", data: { updatedAt: "2026-10-23T09:00:00.000Z" } }, { id: "new", data: { updatedAt: "2026-10-23T10:05:00.000Z" } }];
const out = keepNewerLocal(stale, current, Date.parse("2026-10-23T10:00:30.000Z"));
ok((out.docs.find((d) => d.id === "inv1011")!.data as typeof sent).status === "sent", "newer local save kept over the synced list");
ok(out.docs.some((d) => d.id === "new"), "a document created during the sync is not dropped");
store.set(DOCS_KEY, JSON.stringify(current));
writeLocalDocsKeepingNewer(stale, Date.parse("2026-10-23T10:00:30.000Z"));
const after = JSON.parse(store.get(DOCS_KEY)!);
ok(after.find((d: { id: string }) => d.id === "inv1011").data.price !== "300" && after.find((d: { id: string }) => d.id === "inv1011").data.status === "sent", "writes to localStorage keep Sent $350");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
if (fails) process.exit(1);
