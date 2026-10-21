import { test } from "node:test";
import assert from "node:assert/strict";
import { helpMatches, withinOneEdit } from "@/lib/help/search";
import { HELP_ARTICLES } from "@/lib/help/articles";

const hay = (q: string) => HELP_ARTICLES.filter((a) => helpMatches([a.question, a.summary || "", ...a.steps, ...(a.keywords || [])].join(" "), q)).map((a) => a.id);

test("edit distance", () => {
  assert.ok(withinOneEdit("invoce", "invoice"));
  assert.ok(withinOneEdit("recipt", "receipt"));
  assert.ok(withinOneEdit("invioce", "invoice"));
  assert.ok(withinOneEdit("stirpe", "stripe"));
  assert.ok(!withinOneEdit("crew", "clue"));
});
test("typos find the right article", () => {
  assert.ok(hay("recipt").includes("receipt"));
  assert.ok(hay("invioce").includes("first-invoice"));
  assert.ok(hay("stirpe").includes("stripe-setup"));
  assert.ok(hay("acountant").includes("accountant-package"));
});
test("exact search unchanged and short words stay strict", () => {
  assert.ok(hay("first day").includes("day1-business"));
  assert.equal(hay("zzzz qqqq").length, 0);
  assert.ok(!helpMatches("pay now", "pat"));
});
test("first-day guides link only to real articles", () => {
  const ids = new Set(HELP_ARTICLES.map((a) => a.id));
  assert.equal(ids.size, HELP_ARTICLES.length, "duplicate ids");
  for (const a of HELP_ARTICLES.filter((x) => x.id.startsWith("day1-"))) for (const r of a.related || []) assert.ok(ids.has(r), `${a.id} → ${r}`);
});
