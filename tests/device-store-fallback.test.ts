/** No IndexedDB (private mode / old WebView): device-store falls back to localStorage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeLocalStorage } from "./helpers/fake-idb";
import * as store from "@/lib/device-store";

delete (globalThis as { indexedDB?: unknown }).indexedDB;
const ls = installFakeLocalStorage();

test("localStorage fallback for get/set/del/entries", async () => {
  assert.equal(await store.usingIndexedDb(), false);
  await store.idbSet("drafts", "invoice::1", { a: 1 });
  assert.deepEqual(await store.idbGet("drafts", "invoice::1"), { a: 1 });
  assert.ok([...ls.keys()].some((k) => k.startsWith("clientready-idbfallback:drafts:")), "prefixed so wipeThisDevice clears it");
  assert.deepEqual(await store.idbEntries("drafts"), [["invoice::1", { a: 1 }]]);
  await store.idbDel("drafts", "invoice::1");
  assert.equal(await store.idbGet("drafts", "invoice::1"), undefined);
  assert.equal(await store.mirrorLocalToIdb(), 0, "no mirror without IndexedDB");
});
