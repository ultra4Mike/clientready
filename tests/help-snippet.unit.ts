import { test } from "node:test";
import assert from "node:assert/strict";
import { helpMatches, helpSnippet } from "@/lib/help/search";

test("multi-word, case-insensitive match", () => {
  assert.ok(helpMatches("Print / Save PDF on Accountant Export", "save PDF"));
  assert.ok(!helpMatches("Print / Save PDF", "save zebra"));
  assert.ok(helpMatches("anything", "  "));
});
test("snippet centres on the first matching word", () => {
  const text = "a".repeat(100) + " Stripe payouts arrive in two days " + "b".repeat(100);
  const s = helpSnippet(text, "PAYOUTS", 10);
  assert.ok(s.startsWith("…") && s.endsWith("…"));
  assert.match(s, /payouts/i);
  assert.equal(helpSnippet("short text", "missing"), "");
  assert.equal(helpSnippet("short text", "short"), "short text");
});
