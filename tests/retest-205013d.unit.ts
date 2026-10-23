// Retest of 205013d: change-order revision drag (bug 1), holiday leave settings (2), FLSA switch (3), stored days (5), chips (6).
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } };
import { allConflicts, bookingConflicts, clashPrompts } from "@/lib/conflicts";
import { crewHandoff } from "@/lib/change-orders";
import { chipTimeRange } from "@/lib/chip-time";
import { applySchedule, moveSchedule, readSchedule, scheduleDays } from "@/lib/schedule";
import { flsaWords } from "@/lib/overtime-rules";
import { OT_KEYS } from "@/components/timesheet/OvertimeRulesFields";
import { PTO_KEYS } from "@/components/timesheet/PtoRulesFields";
import { ptoBalance } from "@/lib/pay-phase2";
import { DEFAULT_TIMESHEET_SETTINGS } from "@/lib/timesheet";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };

// ---- Bug 1: INV-1011 (sent revision of INV-1010) dragged onto a time held only by its own parent.
const sch = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime, workerIds: ["e1"], status: "scheduled" });
const parent = { id: "p", type: "invoice", data: { invoiceNumber: "INV-1010", status: "sent", schedule: sch("2026-10-26", "09:00", "12:00"), crew: [{ id: "r1", employeeId: "e1", name: "Ann", rate: "20", hours: "", paidToWorker: false }, { id: "r2", employeeId: "e2", name: "Bo", rate: "20", hours: "3", paidToWorker: false }] } };
const rev = { id: "v", type: "invoice", data: { invoiceNumber: "INV-1011", status: "sent", coMode: "revision", revises: { id: "p", number: "INV-1010" }, changeOrderOf: { id: "p" }, schedule: sch("2026-10-26", "10:00", "13:00"), crew: [] } };
const other = { id: "o", type: "invoice", data: { invoiceNumber: "INV-2000", status: "sent", schedule: sch("2026-10-27", "09:00", "12:00") } };
const docs = [parent, rev, other] as never[];
ok(bookingConflicts(docs, "v", sch("2026-10-26", "10:00", "13:00") as never).length === 0, "a sent revision never clashes with the version it replaces");
ok(allConflicts(docs).length === 0, "conflict list: no 'already booked' between INV-1010 and INV-1011");
ok(bookingConflicts(docs, "v", sch("2026-10-27", "10:00", "13:00") as never).length === 1, "a real clash with another job is still caught");
const draftRev = { ...rev, data: { ...rev.data, status: "draft" } };
ok(bookingConflicts([parent, draftRev, other] as never[], "o", sch("2026-10-26", "10:00", "11:00") as never).length === 1, "draft revision: the parent still holds its time (one clash, not two)");
const hand = crewHandoff(parent as never, rev as never)!;
const pc = (hand.parent as typeof parent).data.crew; const rc = (hand.rev as typeof rev).data.crew as { employeeId: string; hours: string }[];
ok(pc.length === 1 && pc[0].id === "r2", "parent keeps only worked rows (hours > 0)");
ok(rc.length === 1 && rc[0].employeeId === "e1" && rc[0].hours === "", "unpaid, unclocked row moves to the sent revision");
ok(crewHandoff(hand.parent as never, hand.rev as never) === null, "hand-off is idempotent");
const back = crewHandoff(hand.parent as never, { ...(hand.rev as typeof rev), data: { ...(hand.rev as typeof rev).data, status: "void" } } as never)!;
ok((back.parent as typeof parent).data.crew.length === 2 && !("crewMovedTo" in (back.parent as typeof parent).data), "voiding the revision gives the rows back");
const pr = clashPrompts("Ann", "1:00 PM");
ok(/OK: move it to the next open time, 1:00 PM\./.test(pr.move) && /Cancel: don't move it there/.test(pr.move), "move prompt says what OK and Cancel do");
ok(/^Book anyway\?/.test(pr.anyway) && /OK: book it here anyway/.test(pr.anyway) && /Cancel: keep it where it was/.test(pr.anyway), "book-anyway prompt matches the first prompt's Cancel");
ok(pr.move.includes("Ann") && pr.anyway.includes("Ann"), "both prompts name the person");

// ---- Bug 2: holiday is owner-added, off the PTO balance; the count-toward-OT box is saved with time off.
const reqs = [{ id: "h", employeeId: "e1", date: "2026-11-26", hours: 8, kind: "holiday", status: "approved" }, { id: "t", employeeId: "e1", date: "2026-11-27", hours: 4, kind: "pto", status: "approved" }];
const bal = ptoBalance({ policy: { ...DEFAULT_TIMESHEET_SETTINGS, ptoPreset: "custom", ptoPerHours: 10 } as never, worker: undefined, workedHours: 200, requests: reqs as never, employeeId: "e1", year: "2026", today: "2026-12-01" } as never);
ok(bal.taken === 4, "holiday hours never come out of the PTO balance");
ok((PTO_KEYS as readonly string[]).includes("otCountHoliday"), "Settings > Time off saves 'count holiday toward overtime'");

// ---- Bug 3: FLSA day-rate / piece-rate switch.
ok(flsaWords({ ...DEFAULT_TIMESHEET_SETTINGS, otPreset: "custom", otMultiplier: 2, weeklyOtHours: 44 } as never).label === "Overtime for day-rate and piece-rate pay: (2 - 1) x regular rate after 44 h", "label uses the real multiplier and threshold");
ok((OT_KEYS as readonly string[]).includes("flsaNonHourly") && (OT_KEYS as readonly string[]).includes("bonusInRegularRate"), "Settings > Overtime saves the FLSA switch, separately from job bonuses");
ok(!/bonus/i.test(flsaWords(DEFAULT_TIMESHEET_SETTINGS).label), "FLSA label is not the bonus setting");

// ---- Bug 5: days stored with no crew survive edits and moves.
const job = { id: "j", data: { schedule: { ...sch("2026-11-02", "08:00", "16:00"), workerIds: [], days: [{ date: "2026-11-03", startTime: "08:00", endTime: "16:00" }, { date: "2026-11-04" }] }, crew: [] } };
const s0 = readSchedule(job.data)!;
ok(s0.days?.length === 2, "stored days are read back");
const { days: _d, ...noDays } = s0; void _d;
const edited = applySchedule([job] as never[], "j", { ...noDays, startTime: "09:00" } as never)!.doc as typeof job;
ok(readSchedule(edited.data)!.days?.length === 2, "editing the time (no days key) keeps the stored days");
const moved = applySchedule([job] as never[], "j", moveSchedule(s0, "2026-11-09") as never)!.doc as typeof job;
ok(readSchedule(moved.data)!.days!.map((d) => d.date).join() === "2026-11-10,2026-11-11", "moving the job moves its stored days");
ok([...scheduleDays(readSchedule(moved.data))].sort().join() === "2026-11-09,2026-11-10,2026-11-11", "calendar shows all 3 days");
const cleared = applySchedule([job] as never[], "j", { ...s0, days: [] } as never)!.doc as typeof job;
ok(!readSchedule(cleared.data)!.days?.length, "an explicit empty days list removes them");

// ---- Bug 6: chip start and end.
ok(chipTimeRange("09:00", "13:00") === "9:00-1:00 PM", "9:00-1:00 PM");
ok(chipTimeRange("13:30", "15:00") === "1:30-3:00 PM", "1:30-3:00 PM");
ok(chipTimeRange("21:00", "01:00") === "9:00 PM-1:00 AM", "overnight shows both halves");
ok(chipTimeRange("09:00", "") === "9:00 AM", "no end: start only");
ok(chipTimeRange("09:00", "13:00").length <= 12, "short enough for a 390px cell");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
if (fails) process.exit(1);
