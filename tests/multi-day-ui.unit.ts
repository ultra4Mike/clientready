import { jobDays, dayLabel, addJobDay, removeJobDay, updateJobDay, allDayWorkerIds, expandJobDays, dragPayload, readDragPayload, dayDateProblem } from "@/lib/job-days";
import { shiftCrewDays, scheduleDays, type Schedule } from "@/lib/schedule";
import { revisionData } from "@/lib/change-orders";
import { flsaWords, countedOffHours } from "@/lib/overtime-rules";
import { ptoBalance, ptoDays, ptoKindLabel, type PtoRequest } from "@/lib/pay-phase2";
import { ptoWeekOff } from "@/lib/timesheet-pay";
import { readTimesheetSettings, DEFAULT_TIMESHEET_SETTINGS } from "@/lib/timesheet";
import { docHasContent } from "@/lib/empty-docs";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const sched: Schedule = { date: "2026-11-02", startTime: "08:00", endTime: "12:00", workerIds: ["e1", "e2"], status: "scheduled", updatedAt: "x" };
const people = [{ id: "e1", name: "Ann", rate: "25", active: true }, { id: "e2", name: "Bo", rate: "20", active: true }, { id: "e3", name: "Cy", rate: "30", active: true, paySettings: { type: "job" } }] as never[];

// + Add day on a single-day job with no rows yet
ok(jobDays(sched, []).length === 1 && dayLabel(jobDays(sched, [])[0]) === "", "single day: one day, no label");
const c1 = addJobDay(sched, [], people)!;
ok(!!c1 && c1.filter((r) => r.workDate === "2026-11-02").length === 2 && c1.filter((r) => r.workDate === "2026-11-03").length === 2, "add day: day-1 anchors + day 2 for day-1 crew");
const d1 = jobDays(sched, c1);
ok(d1.length === 2 && dayLabel(d1[1]) === "Day 2 of 2" && d1[1].startTime === "08:00", "Day 2 of 2 label, day-1 times");
const c2 = addJobDay(sched, c1, people)!;
ok(jobDays(sched, c2).map((d) => d.date).join() === "2026-11-02,2026-11-03,2026-11-04" && dayLabel(jobDays(sched, c2)[0]) === "Day 1 of 3", "third day on the next date; Day 1 of 3");
ok(addJobDay({ ...sched, workerIds: [] }, [], people) === null, "no crew: cannot add a day");
// edit a day: date, time, crew
const c3 = updateJobDay(sched, c2, "2026-11-04", { date: "2026-11-06", startTime: "07:00", workerIds: ["e2", "e3"] }, people);
const day3 = jobDays(sched, c3)[2];
ok(day3.date === "2026-11-06" && day3.startTime === "07:00" && day3.workerIds.sort().join() === "e2,e3", "edit day 3: date, start, crew");
ok(c3.find((r) => r.employeeId === "e3")?.fixedPay === "0", "per-job pay is not repeated on extra days");
ok(updateJobDay(sched, c2, "2026-11-04", { workerIds: [] }, people) === c2, "a day keeps at least one person");
ok(dayDateProblem(sched, c2, "2026-11-04", "2026-11-01") !== "" && dayDateProblem(sched, c2, "2026-11-04", "2026-11-03") !== "" && dayDateProblem(sched, c2, "2026-11-04", "2026-12-30") !== "", "bad dates rejected");
ok(allDayWorkerIds(sched, c3).sort().join() === "e1,e2,e3", "schedule crew = union of all days");
// remove a day keeps locked rows
const paidRow = { ...c3.find((r) => r.workDate === "2026-11-03")!, id: "paid", paidToWorker: true };
const c4 = removeJobDay(sched, [...c3, paidRow], "2026-11-03");
ok(c4.filter((r) => r.workDate === "2026-11-03").map((r) => r.id).join() === "paid", "remove day: paid row stays");
ok(removeJobDay(sched, c3, "2026-11-02") === c3, "day 1 cannot be removed");
// calendar expand + drag payload
const exp = expandJobDays([{ doc: { id: "d", data: { crew: c2 } }, schedule: sched }]);
ok(exp.length === 3 && exp[2].schedule.date === "2026-11-04" && exp[2].day?.offset === 2 && exp[0].day?.index === 1, "calendar shows the job on each day");
ok(dragPayload("d", 2) === "d|2" && readDragPayload("d|2").offset === 2 && readDragPayload("d").offset === 0 && readDragPayload("d|999").offset === 0, "drag payload carries the day offset");
// drag moves all days, locked rows stay
const moved = shiftCrewDays([...c2, paidRow], sched, "2026-11-09");
ok(moved.filter((r) => r.id !== "paid").map((r) => r.workDate).sort().join() === ["2026-11-09", "2026-11-09", "2026-11-10", "2026-11-10", "2026-11-11", "2026-11-11"].join(), "drag shifts every unpaid day");
ok(moved.find((r) => r.id === "paid")?.workDate === "2026-11-03", "drag never moves paid rows");
ok([...scheduleDays({ ...sched, date: "2026-11-09" }, moved.filter((r) => r.id !== "paid"))].length === 3, "still 3 days after drag");
// change order copy-over
const orig = { id: "o", type: "invoice", title: "INV-1", data: { invoiceNumber: "INV-1", status: "sent", items: [{ description: "x", qty: "1", rate: "1" }], schedule: sched, crew: c2 } };
const rev = revisionData(orig as never, orig as never, "INV-2", "2026-10-23", "2026-11-06", 1) as unknown as { crew: typeof c2; schedule: Schedule };
ok(jobDays(rev.schedule || sched, rev.crew).length === 3, "change order copies all days");

// FLSA words
ok(flsaWords({ ...DEFAULT_TIMESHEET_SETTINGS, otPreset: "federal", otMultiplier: 1.5, weeklyOtHours: 40 } as never).label.includes("(1.5 - 1) x regular rate for hours over 40 h"), "FLSA label uses 1.5 and 40");
ok(flsaWords({ ...DEFAULT_TIMESHEET_SETTINGS, otPreset: "custom", otMultiplier: 2, weeklyOtHours: 44 } as never).preview.includes("(2 - 1) x regular rate for hours over 44 h"), "FLSA preview uses actual multiplier/threshold");

// Holiday
ok(ptoKindLabel("holiday") === "Holiday" && ptoKindLabel("sick", true) === "sick" && ptoKindLabel("pto", true) === "PTO", "kind labels");
const reqs: PtoRequest[] = [
  { id: "h", employeeId: "e1", date: "2026-11-26", hours: 8, kind: "holiday", status: "approved", createdAt: "x" },
  { id: "p", employeeId: "e1", date: "2026-11-25", hours: 4, kind: "pto", status: "approved", createdAt: "x" },
];
const bal = ptoBalance({ policy: { ptoPreset: "custom", ptoPerHours: 30, ptoCapHours: 0, ptoUseCapHours: 0, ptoWaitDays: 0 } as never, workedHours: 300, requests: reqs, employeeId: "e1", year: "2026", today: "2026-12-01" });
ok(bal.taken === 4, "holiday hours never come off the PTO balance");
const days = ptoDays(reqs, [{ id: "e1", rate: "20" }], "2026-11-01", "2026-11-30");
ok(days.get("e1|2026-11-26")?.holidayHours === 8 && days.get("e1|2026-11-26")?.cents === 16000 && days.get("e1|2026-11-25")?.holidayHours === 0, "holiday paid at normal rate, tracked separately");
const wk = ptoWeekOff(reqs, "e1").get("2026-11-23");
ok(wk?.holiday === 8 && wk?.pto === 4, "week off splits holiday");
ok(countedOffHours(wk, { pto: true }) === 4 && countedOffHours(wk, { pto: true, holiday: true }) === 12, "Holiday counts toward OT only when ticked");
ok(readTimesheetSettings({}).otCountHoliday === false && readTimesheetSettings({ otCountHoliday: true }).otCountHoliday === true, "otCountHoliday default off, round-trips");

// New job never written while empty
ok(!docHasContent({ clientName: "", items: [{ description: "", rate: "" }], payments: [] } as never), "blank new job has no content (never saved, no INV number used)");

console.log(fails ? `${fails} FAILED` : "ALL PASS"); if (fails) process.exit(1);
