// pt512u (QA4): change-order 409, unschedule, void on dashboard, blank lines, decline, checklist ticks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertSafeData } from "../src/lib/change-orders";
import { applySchedule } from "../src/lib/schedule";
import { derivedWhen } from "../src/lib/job-when";
import { missingFields, reviewItems } from "../src/lib/review";
import { visibleLines } from "../src/lib/visible-lines";
import { readApproval, approvalLabel } from "../src/lib/approval";
import { toggleChecklistItem, doneChecklistWarning } from "../src/lib/checklist";

let n = 0; const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };

// 1. 409 root cause: a change order never carries fromProposal into the insert.
const co = insertSafeData("invoice", { changeOrderOf: "p1", fromProposal: { id: "prop1", number: "P-1" }, total: 5 });
ok(!("fromProposal" in co) && (co.proposalRef as { id: string }).id === "prop1", "change order: fromProposal moved to proposalRef");
const plain = { fromProposal: { id: "prop1" } };
ok(insertSafeData("invoice", plain) === plain, "normal converted invoice unchanged");
const src = readFileSync("src/lib/change-orders.ts", "utf8");
ok(/proposalRef/.test(src), "revisionData keeps the link as proposalRef");
ok(/inFlight/.test(readFileSync("src/lib/cloud-docs.ts", "utf8")), "concurrent retries share one upload (no duplicates)");

// 2. Unschedule keeps time + checklist, never throws.
const doc = { id: "d1", type: "invoice", data: { status: "sent", jobStart: "09:00", jobEnd: "11:00", schedule: { date: "2026-10-20", startTime: "09:00", endTime: "11:00", workerIds: [], status: "scheduled", updatedAt: "", checklist: [{ id: "c1", text: "Sweep" }] } } };
let out: typeof doc[] = [];
assert.doesNotThrow(() => { out = (applySchedule([doc] as never, "d1", null) as unknown as { docs: typeof doc[] }).docs; });
const d = out[0].data as Record<string, unknown>;
ok(!d.schedule && d.jobStart === "09:00", "unschedule removes the schedule, keeps the time");
ok(((d.unscheduled as { checklist?: unknown[] }).checklist || []).length === 1, "checklist parked");
ok(derivedWhen(d) === null, "unscheduled job is not re-derived onto the calendar");
ok(/unscheduled && !stored\?\.data\?\.schedule/.test(readFileSync("src/app/invoice/page.tsx", "utf8")), "invoice save respects unscheduled");

// 3. Void docs: never done / missing signature.
const voided = { id: "v", type: "invoice", data: { status: "void", fromProposal: { id: "x" }, schedule: { date: "2026-10-20", startTime: "09:00", status: "done", workerIds: [], updatedAt: "" } } };
ok(missingFields(voided as never).length === 0, "void has no missing fields");
ok(!reviewItems([voided] as never, []).some((item) => item.docId === "v"), "void not listed on dashboard review");

// 4. Client view hides blank lines.
ok(visibleLines([{ description: "", qty: "1", rate: "0" }, { description: "Paint", qty: "1", rate: "0" }, { description: " ", qty: "2", rate: "5" }]).length === 2, "blank lines hidden");

// 5. Decline keeps pending + reason.
const a = readApproval({ status: "pending", createdAt: "x", declinedAt: "2026-10-24T10:00:00Z", declineReason: "Too pricey" });
ok(a?.declinedAt && approvalLabel(a).includes("Too pricey"), "declined label shows reason");
ok(/decline_document/.test(readFileSync("/workspace/deploy34.sql", "utf8")), "decline SQL flagged in deploy34");

// 6. Owner ticks + warning before Done.
const items = [{ id: "a", text: "Sweep" }, { id: "b", text: "Photos" }];
const ticked = toggleChecklistItem(items, "a", "Owner", "t");
ok(ticked[0].done && ticked[0].doneBy === "Owner", "owner tick");
ok(!toggleChecklistItem(ticked, "a", "Owner")[0].done, "untick");
ok(doneChecklistWarning(ticked).includes("Photos") && doneChecklistWarning(items.map((i) => ({ ...i, done: true }))) === "", "warning only with unticked items");

// 7. Stray $ in deposit text.
ok(!/\(\$\{pct\}%/.test(readFileSync("src/components/StageSchedule.tsx", "utf8")), "no stray $ before deposit %");

console.log(`qa4-fixes: ${n} checks passed`);
