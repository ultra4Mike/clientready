import { followSchedule, scheduleDays, jobScheduleFromForm, crewForWorkers, shiftCrewDays, applySchedule, type Schedule } from "@/lib/schedule";
import { revisionData } from "@/lib/change-orders";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const sched: Schedule = { date: "2026-11-02", startTime: "08:00", endTime: "12:00", workerIds: ["e1", "e2"], status: "scheduled", updatedAt: "x" };
const row = (id: string, emp: string, workDate: string, extra: Record<string, unknown> = {}) => ({ id, employeeId: emp, name: emp, rate: "25", hours: "", startTime: "", endTime: "", workDate, note: "", bonus: "", paidToWorker: false, paidDate: "", ...extra });
const crew = [row("c1", "e1", "2026-11-02"), row("c2", "e2", "2026-11-03", { startTime: "09:00", endTime: "15:00" })];

ok([...scheduleDays(sched, crew)].sort().join() === "2026-11-02,2026-11-03", "multi-day: days come from per-day crew anchored on the schedule day");
const saved = crew.map((r) => followSchedule(r, sched, crew));
ok(saved[0].workDate === "2026-11-02" && saved[0].startTime === "08:00", "day-1 row follows the schedule");
ok(saved[1].workDate === "2026-11-03" && saved[1].startTime === "09:00" && saved[1].endTime === "15:00", "day-2 row keeps its own day and times");
ok(jobScheduleFromForm(sched, { jobStart: "08:00", jobEnd: "12:00", invoiceDate: "2026-10-01", crew }) === sched, "saving per-day crew does not move the schedule");
ok(crewForWorkers(crew, ["e1", "e2"], sched, []).map((r) => r.workDate).join() === "2026-11-02,2026-11-03", "crewForWorkers keeps per-day dates");
// snapping still happens where it should
const noDate = [row("c1", "e1", "2026-11-02"), row("c2", "e2", "")];
ok(followSchedule(noDate[1], sched, noDate).workDate === "2026-11-02", "row with no date snaps to the schedule");
const far = [row("c1", "e1", "2026-11-02"), row("c2", "e2", "2027-03-01")];
ok(followSchedule(far[1], sched, far).workDate === "2026-11-02", "row far outside the job's range snaps");
const before = [row("c1", "e1", "2026-11-02"), row("c2", "e2", "2026-10-20")];
ok(followSchedule(before[1], sched, before).workDate === "2026-11-02", "row before the first day snaps");
const moved = { ...sched, date: "2026-11-10" };
ok(crew.map((r) => followSchedule(r, moved, crew).workDate).join() === "2026-11-10,2026-11-10", "whole-job reschedule (no row on the new day) snaps every unpaid row");
const paid = row("c3", "e1", "2026-10-01", { paidToWorker: true });
ok(followSchedule(paid, moved, [...crew, paid]).workDate === "2026-10-01", "paid rows keep their date");
ok(followSchedule(crew[1], sched).workDate === "2026-11-02", "without siblings: old single-day behaviour");
const single = [row("c1", "e1", "2026-11-05")];
ok(jobScheduleFromForm(sched, { jobStart: "08:00", jobEnd: "12:00", invoiceDate: "2026-10-01", crew: single })?.date === "2026-11-05", "editing the only row's date still moves the schedule");
// carried to the change order
const orig = { id: "o", type: "invoice", title: "INV-1", data: { invoiceNumber: "INV-1", status: "sent", items: [{ description: "x", qty: "1", rate: "1" }], schedule: sched, crew: saved } };
const rev = revisionData(orig as never, orig as never, "INV-2", "2026-10-23", "2026-11-06", 1) as unknown as { crew: { employeeId: string; workDate: string; startTime: string }[] };
ok(rev.crew.map((r) => `${r.employeeId}@${r.workDate}`).join() === "e1@2026-11-02,e2@2026-11-03" && rev.crew[1].startTime === "09:00", "day-2 crew copied to the change order");
// moving a multi-day job shifts every unpaid day row by the same delta
const job = [row("c1", "e1", "2026-11-02"), row("c2", "e2", "2026-11-03", { startTime: "09:00" }), row("c3", "e1", "2026-10-30", { paidToWorker: true, hours: "4" }), row("c4", "e2", "2026-11-03", { clockMinutes: 120 })];
const shifted = shiftCrewDays(job, sched, "2026-11-09");
ok(shifted.map((r) => r.workDate).join() === "2026-11-09,2026-11-10,2026-10-30,2026-11-03", "shift: day rows +7, paid and clocked rows stay");
ok(shiftCrewDays(job, sched, "2026-11-02") === job, "shift: same day is a no-op");
const back = shiftCrewDays(job, sched, "2026-10-31");
ok(back[0].workDate === "2026-10-31" && back[1].workDate === "2026-11-01", "shift: moving earlier keeps the shape");
const docs = [{ id: "d", type: "invoice", data: { invoiceNumber: "INV-9", status: "sent", items: [], schedule: sched, crew: job } }];
const applied = applySchedule(docs as never[], "d", { ...sched, date: "2026-11-09" }) as unknown as { doc: { data: { crew: { id: string; workDate: string; startTime: string }[]; schedule: Schedule } } };
const by = new Map(applied.doc.data.crew.map((r) => [r.id, r]));
ok(applied.doc.data.schedule.date === "2026-11-09" && by.get("c1")?.workDate === "2026-11-09" && by.get("c2")?.workDate === "2026-11-10" && by.get("c2")?.startTime === "09:00", "calendar move (applySchedule): multi-day shape kept");
ok(by.get("c3")?.workDate === "2026-10-30" && by.get("c4")?.workDate === "2026-11-03", "calendar move: paid and clocked rows never move");
console.log(fails ? `${fails} failed` : "all passed"); if (fails) process.exit(1);
