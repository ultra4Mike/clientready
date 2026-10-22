/**
 * Autosave drafts + offline queue (src/lib/drafts.ts, src/lib/offline-queue.ts, src/lib/device-store.ts).
 * Uses the in-memory IndexedDB shim in tests/helpers/fake-idb.ts and a fake cloud that mimics put_form_draft.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeIndexedDb, installFakeLocalStorage } from "./helpers/fake-idb";
import * as drafts from "@/lib/drafts";
import { createQueue, backoffMs } from "@/lib/offline-queue";
import * as store from "@/lib/device-store";

installFakeIndexedDb(); // device-store opens the DB lazily, so installing after import is fine
const ls = installFakeLocalStorage();

type Row = { payload: unknown; version: number; updated_at: string };
const server = new Map<string, Row>();
let online = true;
let user: string | null = "u1";
let puts = 0;
drafts.__setDraftEnv({
  online: () => online,
  cloud: {
    async userId() { return user; },
    async put(d) {
      puts++;
      const k = `${d.formKey}::${d.recordId}`;
      const cur = server.get(k);
      if (cur && cur.version > d.baseVersion) return { status: "conflict", version: cur.version, server_payload: cur.payload };
      const version = (cur?.version ?? 0) + 1;
      server.set(k, { payload: d.payload, version, updated_at: new Date().toISOString() });
      return { status: "ok", version, server_payload: null };
    },
    async get(f, r) { return server.get(`${f}::${r}`) ?? null; },
    async del(f, r) { server.delete(`${f}::${r}`); },
  },
});
const events: string[] = [];
drafts.onDraftStatus((e) => events.push(`${e.status}:${e.formKey}`));

test("put/get/clear: device first, then synced to cloud", async () => {
  events.length = 0;
  await drafts.putDraft("invoice", "doc-1", { client: "Ann", lines: [{ d: "Mow", q: 1 }] });
  const got = await drafts.getDraft<{ client: string }>("invoice", "doc-1");
  assert.equal(got?.payload.client, "Ann");
  assert.deepEqual(events, ["saved-local:invoice", "synced:invoice"]);
  assert.equal(server.get("invoice::doc-1")?.version, 1);
  assert.equal((await drafts.getDraft("invoice", "doc-1"))?.baseVersion, 1);
  assert.equal((await drafts.listDrafts()).length, 1);
  await drafts.clearDraft("invoice", "doc-1");
  assert.equal(await drafts.getDraft("invoice", "doc-1"), null);
  assert.equal(server.has("invoice::doc-1"), false);
});

test("offline: saved locally + queued, coalesced, sent once when back online", async () => {
  events.length = 0;
  online = false;
  puts = 0;
  await drafts.putDraft("client", "", { name: "A" });
  await drafts.putDraft("client", "", { name: "AB" });
  assert.ok(events.includes("offline-queued:client"));
  assert.equal(puts, 0);
  assert.deepEqual((await drafts.getDraft("client"))?.payload, { name: "AB" });
  online = true;
  const res = await drafts.flushDrafts();
  assert.equal(res.left, 0);
  assert.equal(puts, 1, "two offline saves of one form send once");
  assert.deepEqual(server.get("client::")?.payload, { name: "AB" });
  await drafts.clearDraft("client");
});

test("conflict: newer server copy is not overwritten; emits conflict with server payload; resolve mine/theirs", async () => {
  server.set("report::job-9", { payload: { note: "from tablet" }, version: 3, updated_at: new Date().toISOString() });
  let conflict: unknown;
  const off = drafts.onDraftStatus((e) => { if (e.status === "conflict") conflict = e; });
  await drafts.putDraft("report", "job-9", { note: "from phone" });
  off();
  assert.deepEqual(conflict, { status: "conflict", formKey: "report", recordId: "job-9", server: { note: "from tablet" }, serverVersion: 3 });
  assert.deepEqual(server.get("report::job-9")?.payload, { note: "from tablet" });
  assert.deepEqual((await drafts.getDraft("report", "job-9"))?.payload, { note: "from phone" }, "local work kept");
  await drafts.resolveDraftConflict("report", "job-9", "mine", { payload: { note: "from tablet" }, version: 3 });
  assert.deepEqual(server.get("report::job-9"), { ...server.get("report::job-9")!, payload: { note: "from phone" }, version: 4 });
  await drafts.clearDraft("report", "job-9");
});

test("guest / signed out: local only, nothing sent", async () => {
  user = null;
  puts = 0;
  await drafts.putDraft("signup", "", { email: "x@y.z" });
  assert.equal(puts, 0);
  assert.equal((await drafts.getDraft("signup"))?.payload && true, true);
  user = "u1";
  await drafts.clearDraft("signup");
});

test("oversize payload rejected before saving", async () => {
  await assert.rejects(drafts.putDraft("big", "", { s: "x".repeat(600 * 1024) }), /too large/);
});

test("offline queue: FIFO per record, other records continue, idempotent, backoff", async () => {
  let t = 1_000;
  const sent: string[] = [];
  let failB = true;
  const q = createQueue<{ n: string }>("t", async (job) => {
    if (job.recordKey === "B" && failB) return { status: "retry" };
    sent.push(job.payload.n);
    return { status: "ok" };
  }, { now: () => t });
  await q.enqueue({ recordKey: "A", idempotencyKey: "a1", payload: { n: "a1" } });
  await q.enqueue({ recordKey: "B", idempotencyKey: "b1", payload: { n: "b1" } });
  await q.enqueue({ recordKey: "A", idempotencyKey: "a2", payload: { n: "a2" } });
  await q.enqueue({ recordKey: "B", idempotencyKey: "b2", payload: { n: "b2" } });
  await q.enqueue({ recordKey: "A", idempotencyKey: "a1", payload: { n: "a1" } }); // duplicate key: no new job
  assert.equal((await q.jobs()).length, 4);
  await q.flush();
  assert.deepEqual(sent, ["a1", "a2"], "B blocked behind its failed first job; A unaffected");
  await q.flush();
  assert.deepEqual(sent, ["a1", "a2"], "still in backoff");
  failB = false;
  t += backoffMs(1);
  await q.flush();
  assert.deepEqual(sent, ["a1", "a2", "b1", "b2"], "B sent in order after backoff");
  assert.equal(backoffMs(30), 300_000);
});

test("persistence + storage health + mirror (read-only toward localStorage)", async () => {
  assert.equal(await store.requestPersistentStorage(), false); // no navigator.storage in node: never throws
  const h = await store.getStorageHealth();
  assert.equal(h.indexedDb, true);
  ls.set("clientready-docs", "[1,2]");
  ls.set("other-app", "x");
  assert.equal(await store.mirrorLocalToIdb(), 1);
  assert.deepEqual((await store.idbGet<{ value: string }>("mirror", "clientready-docs"))?.value, "[1,2]");
  assert.equal(ls.get("clientready-docs"), "[1,2]");
});
