import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { effectiveDocStatus, isSettledStatus } from "../src/lib/doc-status";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Fully paid invoice saved as draft (INV-1044 case) reads paid everywhere.
const paidInv = { id: "i1", type: "invoice", data: { status: "draft", invoiceNumber: "INV-1044", items: [{ description: "Work", qty: "1", rate: "100" }], payments: [{ id: "p", amount: "100", method: "Cash", date: "2026-10-20" }] } };
assert.equal(effectiveDocStatus(paidInv), "paid");
// Unpaid draft stays draft.
assert.equal(effectiveDocStatus({ ...paidInv, data: { ...paidInv.data, payments: [] } }), "draft");
// Proposal already invoiced (PROP-1010 case): by status, invoicedAs, or a linked invoice.
const prop = { id: "pr1", type: "proposal", data: { status: "draft", invoiceNumber: "PROP-1010" } };
assert.equal(effectiveDocStatus(prop), "draft");
assert.equal(effectiveDocStatus(prop, [{ type: "invoice", data: { fromProposal: { id: "pr1" } } }]), "invoiced");
assert.equal(effectiveDocStatus({ ...prop, data: { status: "sent", invoicedAs: { id: "x" } } }), "invoiced");
assert.equal(effectiveDocStatus({ ...prop, data: { status: "invoiced" } }), "invoiced");
// A void invoice converted elsewhere does not count.
assert.equal(effectiveDocStatus(prop, [{ type: "invoice", data: { status: "void", fromProposal: { id: "pr1" } } }]), "draft");
for (const s of ["paid", "invoiced", "converted", "void"]) assert.ok(isSettledStatus(s));
assert.ok(!isSettledStatus("draft") && !isSettledStatus("sent"));

// The editor uses the one helper for dropdown, buttons and banner; PhoneApproval hides send/draft text when settled.
const inv = src("src/app/invoice/page.tsx");
assert.match(inv, /const effStatus = effectiveDocStatus\(/);
assert.match(inv, /value=\{effStatus\}/);
assert.match(inv, /<PhoneApproval docId=\{docId\} status=\{effStatus\}/);
assert.match(inv, /!isSettledStatus\(effStatus\)/);
assert.match(inv, /<option value="invoiced">Invoiced<\/option>/);
const pa = src("src/components/PhoneApproval.tsx");
assert.match(pa, /settled \? null : status === "draft"/);
assert.match(src("src/components/views/CalendarGridView.tsx"), /status=\{effectiveDocStatus\(editingDoc/);

// Booking link only when on.
const bs = src("src/components/BookingSettings.tsx");
assert.match(bs, /\{enabled \? \(\s*<div[^>]*>\s*<code data-testid="booking-link"/);
assert.match(bs, /Online booking is off — <button[^>]*data-testid="booking-turn-on"[^>]*onClick=\{\(\) => save\(true\)\}/);
console.log("qa2c-fixes ok");
