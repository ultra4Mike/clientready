import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepStripePayments, paidTotal, paymentFields, readPayments, refundableFor, isStripeCardPayment, type Payment } from "../src/lib/payments";

const cash: Payment = { id: "p1", amount: "100.00", method: "Cash", date: "2026-10-20", ref: "" };
const card: Payment = { id: "stripe_cs_1", amount: "50.00", method: "Card (Stripe)", date: "2026-10-20", ref: "pi_123" };
// Partial refunds per payment, linked by "of".
assert.equal(refundableFor([cash, card], "p1"), 100);
const partial: Payment = { id: "refund_manual_a", amount: "-30.00", method: "Refund (Cash)", date: "2026-10-21", ref: "", of: "p1" };
assert.equal(refundableFor([cash, card, partial], "p1"), 70);
assert.equal(refundableFor([cash, card, partial], "stripe_cs_1"), 50);
// A Stripe-dashboard refund (webhook row, no "of") counts against the card payment with the same PaymentIntent.
const dash: Payment = { id: "refund_re_9", amount: "-20.00", method: "Card refund (Stripe)", date: "2026-10-21", ref: "pi_123" };
assert.equal(refundableFor([cash, card, dash], "stripe_cs_1"), 30);
assert.equal(refundableFor([cash, card, dash], "refund_re_9"), 0, "refund rows can't be refunded");
assert.equal(refundableFor([cash, { ...partial, amount: "-100.00" }], "p1"), 0);
assert.ok(isStripeCardPayment(card) && !isStripeCardPayment(cash));
// "of" survives read + save; refunds lower the paid total.
const saved = paymentFields([cash, partial]);
assert.equal(readPayments(saved).find((row) => row.id === partial.id)?.of, "p1");
assert.equal(paidTotal([cash, partial]), 70);
// A stale device save keeps server-recorded refund rows.
const merged = keepStripePayments(paymentFields([cash]) as never, paymentFields([cash, partial]) as never);
assert.ok(readPayments(merged as never).some((row) => row.id === partial.id), "refund row kept on sync");

// Route: owner only, idempotent Stripe call, recorded via the service-role RPC, history logged in SQL.
const route = readFileSync("src/app/api/pay/refund/route.ts", "utf8");
assert.match(route, /eq\("user_id", owner\.id\)/);
assert.match(route, /"idempotency-key": `cr-refund-\$\{requestId\}`/);
assert.match(route, /rpc\("record_owner_refund"/);
const sql = readFileSync("supabase/migrations/20261024200000_owner_refunds.sql", "utf8");
assert.match(sql, /'history', v_history/);
assert.match(sql, /revoke all on function public\.record_owner_refund[^;]+from public, anon, authenticated/);
assert.match(readFileSync("src/app/invoice/page.tsx", "utf8"), /<RefundPayment /);
console.log("refunds-r2 ok");
