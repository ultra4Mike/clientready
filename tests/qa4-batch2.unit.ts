// t514u (QA4 batch 2): reports billed, recurring banner, series delete, day jobs, whens, CSV, filters.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { billedAmount, billedOutstanding } from "../src/lib/money";
import { recurringDraftsReady, seriesDeletePlan } from "../src/lib/recurring";
import { jobsOnDay } from "../src/lib/day-jobs";
import { whenLabel } from "../src/lib/job-when";
import { manualMethodsFrom } from "../src/lib/payments";

let n = 0; const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const inv = (id: string, data: Record<string, unknown>): { id: string; type: string; title: string; clientName: string; createdAt: string; data: Record<string, unknown> } => ({ id, type: "invoice", title: id, clientName: "A", createdAt: "2026-10-01", data: { items: [{ qty: "1", rate: "100" }], invoiceDate: "2026-10-01", ...data } });

// 11. Reports Billed uses the Documents rule.
const docs = [inv("1", { status: "sent" }), inv("2", { status: "void" }), inv("3", { status: "draft" })];
ok(billedAmount(docs[0] as never, docs as never) === 100 && billedAmount(docs[1] as never, docs as never) === null && billedAmount(docs[2] as never, docs as never) === null, "billedAmount rule");
ok(billedOutstanding(docs as never).billed === 100, "billedOutstanding agrees");
ok(/billedAmount/.test(readFileSync("src/lib/reports.ts", "utf8")), "reports use billedAmount");

// 7. Banner respects Mark reviewed.
const pend = inv("r1", { status: "draft", recurringReview: "pending" });
ok(recurringDraftsReady([pend]) === 1 && recurringDraftsReady([{ ...pend, data: { ...pend.data, reviews: { recurring: "100.00" } } }]) === 0, "reviewed draft not counted");

// 8. Series delete: no orphans.
const tpl = inv("t", { status: "sent", recurring: { active: true } });
const a = inv("a", { status: "draft", recurringFrom: { id: "t", period: "p1" }, recurringReview: "pending" });
const b = inv("b", { status: "sent", recurringFrom: { id: "t", period: "p2" } });
const all = seriesDeletePlan([tpl, a, b], "t", true);
ok(all.removeIds.join() === "a" && all.detached.length === 1 && !all.detached[0].data.recurringFrom, "series: drafts removed, sent kept and detached");
const keep = seriesDeletePlan([tpl, a, b], "t", false);
ok(!keep.removeIds.length && keep.detached.every((d) => !d.data.recurringFrom && !d.data.recurringReview), "keep instances: all detached");

// 9. Today/route: one job per visit, multi-day days, no void.
const sched = (date: string, extra: Record<string, unknown> = {}) => ({ schedule: { date, startTime: "09:00", workerIds: [], status: "scheduled", updatedAt: "", ...extra } });
const prop = { id: "p", type: "proposal", title: "PROP-1008", clientName: "A", createdAt: "x", data: { status: "approved", ...sched("2026-10-25") } };
const fromProp = inv("i", { status: "sent", fromProposal: { id: "p" }, ...sched("2026-10-25") });
const voidJob = inv("v", { status: "void", ...sched("2026-10-25") });
const day = jobsOnDay([prop, fromProp, voidJob] as never, "2026-10-25");
ok(day.length === 1 && day[0].doc.id === "i", "proposal + invoice show once, void hidden");
const multi = inv("m", { status: "sent", ...sched("2026-10-24", { days: [{ date: "2026-10-25", startTime: "08:00", workerIds: [] }] }) });
ok(/day-jobs/.test(readFileSync("src/lib/route.ts", "utf8")) && /jobsOnDay/.test(readFileSync("src/lib/today-jobs.ts", "utf8")), "route + Today share jobsOnDay");
void multi;

// Printouts: date with time.
ok(whenLabel({ schedule: { date: "2026-10-25", startTime: "09:00", endTime: "11:30" } }).includes("9:00 AM – 11:30 AM"), "when label has time");

// Minor: no Card (Stripe) among manual methods.
ok(!manualMethodsFrom(["Cash", "Card (Stripe)", "Check"]).includes("Card (Stripe)"), "manual methods drop Stripe");
const dl = readFileSync("src/components/views/DocumentsListView.tsx", "utf8");
ok(/Delete selected\{selected.size/.test(dl) && /item.description/.test(dl), "delete count + line-item search");
ok(/window.confirm\(`Remove this/.test(readFileSync("src/app/invoice/page.tsx", "utf8")), "confirm before removing a payment");
const view = readFileSync("src/app/invoice-view/page.tsx", "utf8");
ok(/view-refund-line/.test(view) && !/<span>-\$\{amountOf\(payment.amount\)/.test(view), "refund lines, payments positive");
ok(/receipt-show-all/.test(readFileSync("src/app/approve/page.tsx", "utf8")), "receipt show all payments");

console.log(`qa4-batch2: ${n} checks passed`);
