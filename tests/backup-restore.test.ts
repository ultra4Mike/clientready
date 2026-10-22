/**
 * Backup safety: export (src/lib/account-export.ts ZIP + backup.json) -> restore into an empty device.
 * The restore step lives inline in src/app/backup/page.tsx (restoreBackup + keepLiveApprovals); it is
 * mirrored here as restoreInto() (keep in sync). Known gaps are recorded as { todo } so the suite stays green.
 * Run: NODE_OPTIONS=--experimental-websocket NEXT_PUBLIC_SUPABASE_URL=http://localhost:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx tsx --test tests/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportFiles, exportZip, stripLinks } from "@/lib/account-export";
import { mergeDocs } from "@/lib/doc-sync";
import { planRestore, restoreBackupText } from "@/lib/backup-restore";
import { readZipEntry } from "@/lib/zip";

type Row = Record<string, unknown>;
type Store = Map<string, string>;

/** Minimal reader for the stored (uncompressed) ZIPs zipFiles() writes. */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    at = start + size;
  }
  return out;
}

/** The real restore (src/lib/backup-restore.ts), on a Map store. */
const kv = (store: Store) => ({ get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => { store.set(k, v); } });
function restoreInto(store: Store, text: string, ownerId = ""): "restored" | "failed" {
  return restoreBackupText(kv(store), text, ownerId);
}

const pay = (id: string, amount: number, date: string, method = "Cash") => ({ id, amount: String(amount), method, date, ref: "QA-ref" });
function sample(n = 0) {
  const profile = { businessName: "QA Backup Co", ownerName: "QA Owner", email: "clientreadytest+backup@mail.grokbot.com", paymentTerms: "Net 14", lateFeeType: "percent", lateFeeValue: "1.5", setAsidePercent: "25", overtimeHours: "40", automations: { reminders: false } };
  const clients = [
    { id: "c1", name: "QA Backup Client One", company: "QA LLC", email: "clientreadytest+c1@mail.grokbot.com", phone: "555-0100", address: "1 Test St", notes: "gate code \"42\", comma, newline\nok", preferences: "text", contactMethod: "email" },
    { id: "c2", name: "QA Backup Client Two — ünïcode 🌿", email: "", phone: "", address: "" },
  ];
  const employees = [
    { id: "e1", name: "QA Crew Ana", kind: "employee", phone: "555-0101", role: "Lead", rate: "25", hireDate: "2026-01-05", active: true, payType: "hourly" },
    { id: "e2", name: "QA Crew Ben", kind: "contractor", rate: "300", active: false, payType: "per_job" },
  ];
  const documents: Row[] = [
    { id: "d1", type: "invoice", title: "INV-9001", clientName: "QA Backup Client One", createdAt: "2026-09-01T10:00:00.000Z", data: {
      invoiceNumber: "INV-9001", status: "sent", invoiceDate: "2026-09-01", dueDate: "2026-09-15", clientId: "c1", updatedAt: "2026-09-02T10:00:00.000Z",
      items: [{ description: "Mow", qty: "2", rate: "150" }], taxPercent: "8.25", discountType: "amount", discountValue: "10",
      payments: [pay("p1", 100, "2026-09-03"), pay("stripe_pi_1", 200, "2026-09-04", "card"), pay("refund_re_1", -50, "2026-09-05", "card")],
      schedule: { date: "2026-09-10", start: "09:00", end: "11:00", crew: ["e1"] },
      jobCosts: [{ id: "x1", label: "QA mulch", amount: "3.25", by: "e1" }], jobMiles: "12.4",
      hoursApprovals: { e1: true }, visitNotes: [{ by: "e1", at: "2026-09-10T11:00:00Z", text: "done" }],
      approval: { status: "accepted", token: "secret-live-token-abcdefghijklmnop" },
    } },
    { id: "d2", type: "invoice", title: "INV-9002", clientName: "QA Backup Client One", createdAt: "2026-09-12T10:00:00.000Z", data: {
      invoiceNumber: "INV-9002", status: "draft", changeOrderOf: "d1", changeOrderNotes: "extra bed", items: [{ description: "Bed", qty: "1", rate: "80" }], updatedAt: "2026-09-12T10:00:00.000Z",
    } },
    { id: "d3", type: "proposal", title: "Proposal", clientName: "QA Backup Client Two — ünïcode 🌿", createdAt: "2026-08-01T10:00:00.000Z", data: { status: "accepted", items: [{ description: "Design", qty: "1", rate: "500" }], payments: [pay("dep", 100, "2026-08-02")], updatedAt: "2026-08-02T10:00:00.000Z" } },
  ];
  for (let i = 0; i < n; i++) documents.push({ id: `big${i}`, type: "invoice", title: `INV-${10000 + i}`, clientName: "QA Bulk", createdAt: "2026-01-01T00:00:00.000Z", data: { invoiceNumber: `INV-${10000 + i}`, status: "paid", items: Array.from({ length: 5 }, (_, k) => ({ description: `Line ${k} `.repeat(10), qty: "1", rate: "10" })), payments: [pay(`bp${i}`, 50, "2026-01-02")], updatedAt: "2026-01-02T00:00:00.000Z" } });
  return { profile, clients, documents, employees };
}

test("full export ZIP -> restore into empty device round-trips (minus stripped live links)", () => {
  const input = sample();
  const files = unzip(exportZip(input));
  assert.deepEqual(Object.keys(files).sort(), ["backup.json", "clients.csv", "documents.csv", "employees.csv", "line-items.csv", "payments.csv"]);
  const store: Store = new Map();
  assert.equal(restoreInto(store, files["backup.json"]), "restored");
  const expected = stripLinks(input);
  assert.deepEqual(JSON.parse(store.get("clientready-profile")!), expected.profile);
  assert.deepEqual(JSON.parse(store.get("clientready-clients")!), expected.clients);
  assert.deepEqual(JSON.parse(store.get("clientready-documents")!), expected.documents);
  // money/schedule/change-order/expense/mileage detail survives
  const d1 = JSON.parse(store.get("clientready-documents")!)[0].data;
  assert.equal(d1.payments.length, 3);
  assert.equal(d1.payments[2].amount, "-50");
  assert.equal(d1.jobCosts[0].amount, "3.25");
  assert.equal(d1.jobMiles, "12.4");
  assert.equal(d1.schedule.date, "2026-09-10");
  assert.equal(d1.approval.token, undefined, "live approval token never exported");
  assert.match(files["clients.csv"], /"gate code ""42"", comma, newline\nok"/);
});

test("device restore keeps this device's live approval block (R43)", () => {
  const store: Store = new Map([["clientready-documents", JSON.stringify([{ id: "d1", data: { approval: { status: "accepted", token: "live" } } }])]]);
  const backup = JSON.stringify(stripLinks({ documents: sample().documents }));
  restoreInto(store, backup);
  assert.deepEqual(JSON.parse(store.get("clientready-documents")!)[0].data.approval, { status: "accepted", token: "live" });
});

test("fixed: employees in backup.json are not restored", () => {
  const store: Store = new Map();
  restoreInto(store, unzip(exportZip(sample()))["backup.json"]);
  assert.ok(store.has("clientready-employees"));
});

test("restore does not let an older backup overwrite a newer cloud document (sync merge)", () => {
  const restored = sample().documents as { id: string; data: Row }[];
  const cloud = [{ ...restored[0], data: { ...restored[0].data, status: "paid", updatedAt: "2026-10-01T00:00:00.000Z" } }];
  const { merged, pushUp } = mergeDocs(restored, cloud);
  const d1 = merged.find((d) => d.id === "d1")!;
  assert.equal(d1.data.status, "paid", "newer cloud copy wins");
  assert.ok(!pushUp.some((d) => d.id === "d1"));
  assert.ok(merged.some((d) => d.id === "d2"), "docs only in the backup are kept (syncLocalDocs uploads them)");
});

test("fixed: restore overwrites the device's newer local data without warning", () => {
  const store: Store = new Map([["clientready-clients", JSON.stringify([{ id: "c9", name: "QA added after backup" }])]]);
  restoreInto(store, JSON.stringify({ clients: sample().clients }));
  assert.ok(JSON.parse(store.get("clientready-clients")!).some((c: Row) => c.id === "c9"));
});

test("fixed: payments.csv drops refunds (accountant export overstates cash)", () => {
  assert.match(unzip(exportZip(sample()))["payments.csv"], /-50/);
});

test("corrupted backup is rejected and leaves data untouched", () => {
  const store: Store = new Map([["clientready-clients", "[1]"]]);
  const text = unzip(exportZip(sample()))["backup.json"];
  assert.equal(restoreInto(store, text.slice(0, text.length / 2)), "failed");
  assert.equal(store.get("clientready-clients"), "[1]");
});

test("fixed: wrong-shape / other-owner / ZIP backups are accepted", () => {
  const store: Store = new Map([["clientready-clients", "[1]"]]);
  assert.equal(restoreInto(store, JSON.stringify({ clients: "not an array", profile: { businessName: "Someone else" } })), "failed");
});

test("big account (3,000 documents) exports and restores intact and quickly", () => {
  const input = sample(3000);
  const t0 = Date.now();
  const files = unzip(exportZip(input));
  const store: Store = new Map();
  assert.equal(restoreInto(store, files["backup.json"]), "restored");
  const docs = JSON.parse(store.get("clientready-documents")!);
  assert.equal(docs.length, 3003);
  assert.deepEqual(docs, stripLinks(input).documents);
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0}ms`);
  const mb = files["backup.json"].length / 1e6;
  // localStorage is ~5 MB per origin (UTF-16 in some browsers): warn in the report, not a failure here.
  console.log(`backup.json ${mb.toFixed(2)} MB for 3,003 docs`);
  assert.equal(exportFiles(input).length, 6);
});

test("fixed: a backup from another account is refused; the ZIP's backup.json is restorable", () => {
  const store: Store = new Map([["clientready-clients", "[1]"]]);
  const zip = exportZip({ ...sample(), ownerId: "owner-a" });
  const text = readZipEntry(zip, "backup.json")!;
  assert.equal(restoreInto(store, text, "owner-b"), "failed");
  assert.equal(store.get("clientready-clients"), "[1]");
  assert.equal(restoreInto(new Map(), text, "owner-a"), "restored");
});
test("fixed: restore warns how many newer local records it will keep", () => {
  const store: Store = new Map([["clientready-clients", JSON.stringify([{ id: "c9", name: "new" }])]]);
  const plan = planRestore(JSON.stringify({ clients: sample().clients }), kv(store));
  assert.ok(plan.ok && plan.newerLocal === 1);
});
