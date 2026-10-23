import { revisionData, REVISION_NOT_COPIED, changeOrderData } from "@/lib/change-orders";
import { holdsSchedule } from "@/lib/change-order-revision";
import { scheduledJobs } from "@/lib/scheduled-jobs";
import { scheduleFor } from "@/lib/timesheet-sync";
import { crewRowsFor } from "@/lib/crew";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const sig = { type: "typed", text: "Pat", signerName: "Pat", signedAt: "2026-10-20T15:00:00Z" };
const crew = [
  { id: "c1", employeeId: "e1", name: "Ana", rate: "25", hours: "8", startTime: "08:00", endTime: "16:00", workDate: "2026-11-02", note: "day 1", bonus: "10", paidToWorker: true, paidDate: "2026-11-05", payType: "hourly", clockMinutes: 480 },
  { id: "c2", employeeId: "e2", name: "Ben", rate: "30", hours: "", startTime: "08:00", endTime: "16:00", workDate: "2026-11-03", note: "day 2", bonus: "", paidToWorker: false, paidDate: "", payType: "day", fixedPay: "200" },
];
const full: Record<string, unknown> = {
  invoiceNumber: "INV-1", invoiceDate: "2026-10-01", dueDate: "2026-11-15", status: "sent",
  clientName: "QA Client", clientId: "cl1", clientCompany: "Co", contactName: "Pat", clientEmail: "clientreadytest+co@mail.grokbot.com", clientPhone: "555", clientAddress: "1 Main", jobAddress: "2 Job St",
  notes: "customer note", internalNotes: "internal", terms: "Net 15", taxPercent: "8.25", discountType: "percent", discountValue: "5", noLateFee: true, rebillRefund: false,
  depositPercent: "25", stages: [{ id: "s1", label: "Deposit", amount: "100", due: "2026-10-10" }, { id: "s2", label: "Final", amount: "200", due: "2026-11-15" }],
  photos: [{ id: "p1", url: "data:x" }], showPhotos: true, payLink: "https://pay", style: "bold",
  items: [{ description: "Mow", qty: "1", rate: "300", category: "labor" }],
  jobStart: "08:00", jobEnd: "16:00", jobTime: "8am", jobMiles: "12", jobRate: "40", taskType: "mow", prevailingWage: { rate: "45", county: "X" },
  schedule: { date: "2026-11-02", startTime: "08:00", endTime: "16:00", workerIds: ["e1", "e2"], status: "scheduled", updatedAt: "x", crewNote: "gate code", checklist: [{ id: "k1", text: "Photos", done: false }] },
  crew, tags: ["vip"], customFields: { po: "PO-9" }, reminders: { on: true }, recurring: { active: true, frequency: "monthly", nextRunDate: "2026-12-01" }, recurringFrom: null, visitNotes: [{ id: "v" }], pin: { lat: 1, lng: 2, address: "1 Main" },
  // excluded:
  signature: sig, proposalSignature: sig, approval: { status: "approved" }, emailLog: [{ sentAt: "x", to: "y" }], sentAt: "x", viewedAt: "y", updatedAt: "z",
  payments: [{ id: "pay1", amount: "100", method: "card", date: "2026-10-10", ref: "" }], paymentAmount: "100", paymentMethod: "card", paymentDate: "2026-10-10", paymentRef: "r",
  jobCosts: { labor: "200", materials: "50" }, stockUsed: [{ id: "st" }], crewReport: { draftId: "d" }, changeOrderNotes: [{ id: "x", number: "INV-2", createdAt: "" }], hoursApprovals: { e1: {} },
};
const orig = { id: "o", type: "invoice", title: "INV-1", clientName: "QA Client", data: full };
const rev = revisionData(orig, orig, "INV-2", "2026-10-23", "2026-11-06", 300) as Record<string, unknown>;
const special = new Set(["invoiceNumber", "invoiceDate", "status", "items", "crew", "coMode", "revises", "changeOrderOf"]);
for (const key of Object.keys(full)) {
  if ((REVISION_NOT_COPIED as readonly string[]).includes(key)) ok(!(key in rev) || key === "invoiceNumber" || key === "status" || key === "invoiceDate", `excluded: ${key}`);
  else if (!special.has(key)) ok(JSON.stringify(rev[key]) === JSON.stringify(full[key]), `copied: ${key}`);
}
ok(rev.invoiceNumber === "INV-2" && rev.status === "draft" && rev.invoiceDate === "2026-10-23", "own number, draft status, today's date");
ok(!rev.signature && !rev.approval && !rev.payments, "no signature/approval/payments");
const rc = rev.crew as Record<string, unknown>[];
ok(rc.length === 2 && rc[0].employeeId === "e1" && rc[1].employeeId === "e2" && rc[0].workDate === "2026-11-02" && rc[1].workDate === "2026-11-03", "crew + per-day rows carried (2 people, 2 days)");
ok(rc[0].rate === "25" && rc[1].fixedPay === "200" && rc[1].payType === "day", "rates / pay plan carried");
ok(rc[0].hours === "" && rc[0].paidToWorker === false && rc[0].bonus === "" && rc[0].clockMinutes === undefined, "logged hours / paid status stay on the original");
ok((full.crew as Record<string, unknown>[])[0].hours === "8", "original crew rows untouched");
ok(JSON.stringify((rev.items as Record<string, unknown>[])[0]) === JSON.stringify({ ...(full.items as object[])[0], fromVersion: "INV-1" }), "lines labelled From INV-1");
ok((rev.revises as { id: string }).id === "o" && rev.coMode === "revision", "linked revision");

// No double-booking
const draftRev = { id: "r", type: "invoice", title: "INV-2", data: rev };
const sentRev = { ...draftRev, data: { ...rev, status: "sent" } };
ok(holdsSchedule([orig, draftRev], orig) && !holdsSchedule([orig, draftRev], draftRev), "draft CO: original keeps the job");
ok(!holdsSchedule([orig, sentRev], orig) && holdsSchedule([orig, sentRev], sentRev), "sent CO: job moves to the CO");
const j1 = scheduledJobs([orig, draftRev]); ok(j1.length === 1 && j1[0].doc.id === "o", "calendar: one job (original) while draft");
const j2 = scheduledJobs([orig, sentRev]); ok(j2.length === 1 && j2[0].doc.id === "r", "calendar: one job (revision) once sent");
const moved = { ...sentRev, data: { ...sentRev.data, schedule: { ...(rev.schedule as object), date: "2026-11-09", workerIds: ["e2"] } } };
const j3 = scheduledJobs([orig, moved]); ok(j3.length === 1 && j3[0].schedule.date === "2026-11-09" && j3[0].schedule.workerIds.join() === "e2", "revision's own dates/crew win");
const voided = { ...sentRev, data: { ...sentRev.data, status: "void" } };
ok(scheduledJobs([orig, voided]).map((j) => j.doc.id).join() === "o", "voided CO gives the job back");
ok(scheduleFor([orig, sentRev] as never, "e1", "2026-11-02").length === 1, "timesheet planning: one job");
// Crew view mirror: replaced version keeps only rows with logged work; holding version keeps all
ok(crewRowsFor(false, crew).map((r) => r.id).join() === "c1", "replaced/draft: only logged-work rows mirrored");
ok(crewRowsFor(true, crew).length === 2, "holding version mirrors all rows");
// Add-on (legacy) change orders unchanged
const addOn = changeOrderData(orig, "INV-3", "2026-10-23", "2026-11-06") as Record<string, unknown>;
ok(!addOn.schedule && !addOn.crew && !addOn.coMode && (addOn.items as unknown[]).length === 1, "add-on change order: unchanged (delta only, no schedule)");
const addOnDoc = { id: "a", type: "invoice", title: "INV-3", data: { ...addOn, status: "sent" } };
ok(holdsSchedule([orig, addOnDoc], orig), "add-on never takes the job");
if (fails) { console.log(fails + " failed"); process.exit(1); } else console.log("all passed");
