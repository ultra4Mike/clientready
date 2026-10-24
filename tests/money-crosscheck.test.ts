/**
 * Money cross-check: Dashboard, Documents and Reports must agree on billed / collected / outstanding.
 * Collected is the shared cashCollected() helper. Billed and outstanding are still computed inline in
 * src/app/dashboard/page.tsx and src/app/documents/page.tsx, so their formulas are mirrored here
 * (keep in sync). Run (Node 20): NODE_OPTIONS=--experimental-websocket NEXT_PUBLIC_SUPABASE_URL=http://localhost:1
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx tsx --test tests/*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { billedOutstanding, cashCollected } from "@/lib/money";
import { buildReport } from "@/lib/reports";

type Doc = { id: string; type: string; title?: string; clientName?: string; createdAt: string; data: Record<string, unknown> };
const YEAR = "2026";
const items = (rate: number) => [{ qty: "1", rate: String(rate) }];
const pay = (id: string, amount: number, date: string) => ({ id, amount: String(amount), method: "Cash", date, ref: "" });

const docs: Doc[] = [
  // partial payment
  { id: "a", type: "invoice", createdAt: "2026-03-01", data: { invoiceNumber: "INV-1", status: "sent", invoiceDate: "2026-03-01", items: items(300), payments: [pay("p1", 75, "2026-03-05")] } },
  // paid then partially refunded (Stripe refund row)
  { id: "b", type: "invoice", createdAt: "2026-04-01", data: { invoiceNumber: "INV-2", status: "paid", invoiceDate: "2026-04-01", items: items(200), payments: [pay("stripe_x", 200, "2026-04-02"), pay("refund_x", -50, "2026-04-10")] } },
  // proposal deposit carried onto the invoice (counts once)
  { id: "c", type: "proposal", createdAt: "2026-05-01", data: { status: "accepted", items: items(500), payments: [pay("dep", 100, "2026-05-02")] } },
  { id: "d", type: "invoice", createdAt: "2026-05-10", data: { invoiceNumber: "INV-3", status: "sent", invoiceDate: "2026-05-10", fromProposal: { id: "c" }, items: items(500), payments: [pay("dep", 100, "2026-05-02")] } },
  // draft (ignored everywhere)
  { id: "e", type: "invoice", createdAt: "2026-06-01", data: { invoiceNumber: "INV-4", status: "draft", invoiceDate: "2026-06-01", items: items(999) } },
  // voided invoice with an unpaid balance
  { id: "f", type: "invoice", createdAt: "2026-06-05", data: { invoiceNumber: "INV-5", status: "void", invoiceDate: "2026-06-05", items: items(400), payments: [pay("pv", 40, "2026-06-06")] } },
  // change order (its own invoice) on INV-1
  { id: "g", type: "invoice", createdAt: "2026-03-08", data: { invoiceNumber: "INV-6", status: "sent", invoiceDate: "2026-03-08", changeOrderOf: "a", items: items(120) } },
  // duplicate number INV-1 on another client (both are real invoices)
  { id: "h", type: "invoice", clientName: "Other", createdAt: "2026-07-01", data: { invoiceNumber: "INV-1", status: "sent", invoiceDate: "2026-07-01", items: items(80), payments: [pay("p2", 80, "2026-07-02")] } },
  // legacy "marked paid" without payment rows
  { id: "i", type: "invoice", createdAt: "2026-08-01", data: { invoiceNumber: "INV-7", status: "paid", invoiceDate: "2026-08-01", paymentDate: "2026-08-03", items: items(60) } },
  // same document loaded twice (local + cloud copy)
  { id: "a", type: "invoice", createdAt: "2026-03-01", data: { invoiceNumber: "INV-1", status: "sent", invoiceDate: "2026-03-01", items: items(300), payments: [pay("p1", 75, "2026-03-05")] } },
];

// --- Dashboard and Documents both use the shared billedOutstanding (R126) ---
function dashboard(all: Doc[]) {
  return { collected: cashCollected(all), outstanding: billedOutstanding(all).outstanding };
}
function documentsPage(all: Doc[]) {
  const { billed, outstanding } = billedOutstanding(all);
  return { billed, owed: outstanding, collected: cashCollected(all) };
}
// --- Reports (src/lib/reports.ts) ---
const reports = (all: Doc[]) => buildReport(all, [], YEAR).totals;

// Expected by hand: void invoices, drafts and a second copy of the same doc id never count; a Stripe
// refund on a paid invoice lowers collected but does not reopen a balance.
// billed = 300+200+500+120+80+60 = 1260; collected = 75+150+100+80+60 = 465; outstanding = 225+400+120 = 745
const EXPECT = { billed: 1260, collected: 465, outstanding: 745 };

test("collected: Dashboard, Documents and Reports agree (shared cashCollected)", () => {
  assert.equal(dashboard(docs).collected, EXPECT.collected);
  assert.equal(documentsPage(docs).collected, EXPECT.collected);
  assert.equal(reports(docs).collected, EXPECT.collected);
});
test("outstanding: Dashboard and Documents agree with each other", () => {
  assert.equal(dashboard(docs).outstanding, documentsPage(docs).owed);
});
// R126 (fixed): void, duplicate ids and refunded-paid invoices.
test("billed: Documents and Reports agree", () => {
  assert.equal(documentsPage(docs).billed, reports(docs).billed);
});
test("billed excludes voided invoices", () => {
  assert.equal(reports(docs).billed, EXPECT.billed);
});
test("outstanding excludes voided, duplicate-loaded and refunded-paid invoices", () => {
  assert.equal(dashboard(docs).outstanding, EXPECT.outstanding);
});

test("refund state: paid-in-full then refunded is labelled, and re-bill reopens the balance", async () => {
  const { refundState, owedAfterRefunds } = await import("@/lib/payments");
  const rows = [pay("stripe_x", 200, "2026-04-02"), pay("refund_x", -50, "2026-04-10")];
  assert.equal(refundState(200, rows as never), "partially_refunded");
  assert.equal(refundState(200, [pay("stripe_x", 200, "d"), pay("refund_x", -200, "d")] as never), "refunded");
  assert.equal(refundState(300, [pay("p", 75, "d")] as never), "");
  assert.equal(owedAfterRefunds(200, rows as never, "paid"), 0);
  assert.equal(owedAfterRefunds(200, rows as never, "paid", true), 50);
  assert.equal(owedAfterRefunds(400, [] as never, "void"), 0);
});
