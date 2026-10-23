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
test("Deploy 5/6 help: new articles found, related ids real, no hidden autosave draft", async () => {
  const { UPCOMING_HELP_ARTICLES } = await import("@/lib/help/upcoming");
  const ids = new Set(HELP_ARTICLES.map((a) => a.id));
  for (const id of ["invoice-layout", "autosave-drafts", "void-invoice", "payment-terms", "documents-views", "calendar-views", "fix-duplicate-numbers"]) assert.ok(ids.has(id), id);
  for (const a of HELP_ARTICLES) for (const r of a.related || []) assert.ok(ids.has(r), `${a.id} → ${r}`);
  assert.ok(!UPCOMING_HELP_ARTICLES.some((a) => a.id === "autosave-drafts" || ids.has(a.id)));
  assert.ok(hay("void").includes("void-invoice"));
  assert.ok(hay("restore unsaved").includes("autosave-drafts"));
  assert.ok(hay("this week").includes("calendar-views"));
  assert.ok(hay("net 30").includes("payment-terms"));
});
test("R128 help: refunds, approval and hours articles match the shipped wording", async () => {
  const { UPCOMING_HELP_ARTICLES } = await import("@/lib/help/upcoming");
  const by = Object.fromEntries(HELP_ARTICLES.map((a) => [a.id, [a.question, a.summary || "", ...a.steps, ...(a.tips || [])].join(" ")]));
  assert.ok(by["approval-proposals-only"]);
  assert.ok(!UPCOMING_HELP_ARTICLES.some((a) => a.id === "approval-proposals-only"));
  assert.match(by["ts-refund"], /never reopens a balance/);
  assert.match(by["ts-refund"], /Partially refunded \$X/);
  assert.doesNotMatch(by["crew-hours-approval"], /Approve clocked|Approve paid hours/);
  assert.match(by["crew-hours-approval"], /Edit hours/);
  assert.ok(hay("receipt number").includes("receipt"));
  const ids = new Set(HELP_ARTICLES.map((a) => a.id));
  for (const a of HELP_ARTICLES) for (const r of a.related || []) assert.ok(ids.has(r), `${a.id} → ${r}`);
});
test("Phase 2 help: PTO and crew lead articles published with shipped labels", async () => {
  const { UPCOMING_HELP_ARTICLES } = await import("@/lib/help/upcoming");
  const by = Object.fromEntries(HELP_ARTICLES.map((a) => [a.id, [a.question, a.summary || "", ...a.steps, ...(a.tips || [])].join(" ")]));
  for (const id of ["tt-owner-pto", "tt-owner-crew-lead", "tt-owner-team-clock", "tt-crew-time-off", "tt-crew-what-lead-can-do"]) { assert.ok(by[id], id); assert.ok(!UPCOMING_HELP_ARTICLES.some((a) => a.id === id), id); assert.doesNotMatch(by[id], /\[TODO\]/); }
  assert.match(by["tt-owner-pto"], /1 h per … h worked/);
  assert.match(by["tt-crew-time-off"], /Ask for time off/);
  assert.match(by["tt-owner-crew-lead"], /Can clock the crew in and out/);
  assert.doesNotMatch(by["tt-crew-my-hours"], /day total/);
});
test("24-hour calendar help: night and overnight jobs article", () => {
  const ids = new Set(HELP_ARTICLES.map((a) => a.id));
  assert.ok(ids.has("night-overnight-jobs"));
  for (const a of HELP_ARTICLES) for (const r of a.related || []) assert.ok(ids.has(r), `${a.id} → ${r}`);
  assert.ok(hay("overnight").includes("night-overnight-jobs"));
});
