// Phase 2 pay: prevailing wage per job (hourly + non-hourly floor) and FLSA overtime for piece / day-rate workers.
import { allocateWeek, type DayInput } from "@/lib/timesheet-pay";
import { flsaWeek, jobRateOf, jobRates } from "@/lib/pay-phase2";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const tot = (d: { cents: number }[]) => d.reduce((s, x) => s + x.cents, 0);
const day = (date: string, hours: number, jobs: { docId: string; h: number }[] = [{ docId: "A", h: hours }]): DayInput => ({
  date, approved: true, sheet: { paidMinutes: hours * 60, driveMinutes: 0, jobs: jobs.map((j) => ({ docId: j.docId, minutes: j.h * 60 })), drives: [] } as never });
const wk = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];

// Job rate lookup
ok(jobRateOf({ id: "A", data: { jobRate: "52.5" } }) === 52.5, "job's own prevailing rate");
ok(jobRateOf({ id: "B", data: { taskType: "Electrical" } }, { taskRates: { Electrical: 60 } }) === 60, "task rate fallback");
ok(jobRates([{ id: "A", data: { jobRate: "50" } }, { id: "C", data: {} }]).size === 1, "jobs without a rate keep base");

// Hourly on a prevailing wage job: 8 h on A at $50 instead of $20
const hourly = allocateWeek([day(wk[0], 8)], { type: "hourly" }, "20", { jobRates: new Map([["A", 50]]) });
ok(tot(hourly) === 40000, `hourly prevailing 8h x $50 = $400 (got ${tot(hourly) / 100})`);
const hourlyNo = allocateWeek([day(wk[0], 8)], { type: "hourly" }, "20", {});
ok(tot(hourlyNo) === 16000, "no job rate -> base $20");

// Day-rate worker $200/day, 8 h on a $40 prevailing job -> floor $320, top-up $120
const dayPw = allocateWeek([day(wk[0], 8)], { type: "day", dayRate: "200", dayHours: "8" }, "", { jobRates: new Map([["A", 40]]) });
ok(tot(dayPw) === 32000 && dayPw[0].prevailingTopUpCents === 12000, `day rate floored to prevailing (got ${tot(dayPw) / 100})`);
// Day rate already above floor: no top-up
const dayHi = allocateWeek([day(wk[0], 8)], { type: "day", dayRate: "400", dayHours: "8" }, "", { jobRates: new Map([["A", 40]]) });
ok(tot(dayHi) === 40000 && !dayHi[0].prevailingTopUpCents, "day rate above prevailing unchanged");
// Half the day on the prevailing job: floor applies only to those 4 h (200*4/8=100 paid vs 160 floor -> +60)
const dayHalf = allocateWeek([day(wk[0], 8, [{ docId: "A", h: 4 }, { docId: "B", h: 4 }])], { type: "day", dayRate: "200", dayHours: "8" }, "", { jobRates: new Map([["A", 40]]) });
ok(tot(dayHalf) === 26000, `partial prevailing day (got ${tot(dayHalf) / 100})`);

// FLSA: day-rate $200 x 5 days of 10 h = $1000 straight, 50 h -> RR $20, 10 OT h x $10 = $100
const flsaSettings = { flsaNonHourly: true } as never;
const dayOt = allocateWeek(wk.map((d) => day(d, 10)), { type: "day", dayRate: "200", dayHours: "10" }, "", { settings: flsaSettings });
ok(tot(dayOt) === 110000, `day-rate FLSA $1000 + $100 premium (got ${tot(dayOt) / 100})`);
ok(dayOt.reduce((s, d) => s + (d.otHours || 0), 0) === 10, "10 OT hours");
// Off by default: no premium
const dayOff = allocateWeek(wk.map((d) => day(d, 10)), { type: "day", dayRate: "200", dayHours: "10" }, "", { settings: {} as never });
ok(tot(dayOff) === 100000, "FLSA toggle off -> no premium");
// Piece: $1100 of pieces (week extra) over 44 h -> RR $25, 4 OT h x $12.50 = $50 premium (pieces paid on rows, timesheet part = premium)
const pc = allocateWeek([...wk.slice(0, 4).map((d) => day(d, 9)), day(wk[4], 8)], { type: "piece", pieceRate: "10" }, "", { settings: flsaSettings, weekExtra: new Map([[wk[0], 1100]]) });
ok(tot(pc) === 5000, `piece FLSA premium $50 (got ${tot(pc) / 100})`);
// Under 40 h: no premium
ok(tot(allocateWeek(wk.slice(0, 4).map((d) => day(d, 10)), { type: "day", dayRate: "200", dayHours: "10" }, "", { settings: flsaSettings })) === 80000, "40 h exactly -> no OT");
// FLSA regular rate includes the prevailing top-up: day $200 x 5 x 10 h on $30 job -> floor $1500, RR $30, 10 h x $15 = $150
const both = allocateWeek(wk.map((d) => day(d, 10)), { type: "day", dayRate: "200", dayHours: "10" }, "", { settings: flsaSettings, jobRates: new Map([["A", 30]]) });
ok(tot(both) === 165000, `prevailing + FLSA (got ${tot(both) / 100})`);
// Pure helper
const f = flsaWeek(1000, 50); ok(f.regularRate === 20 && f.otHours === 10 && f.premium === 100, "flsaWeek helper");
// Edited day keeps no prevailing split (pay already decided by owner)
const edited = allocateWeek([{ ...day(wk[0], 8), approvedMinutes: 420 }], { type: "day", dayRate: "200", dayHours: "8" }, "", { jobRates: new Map([["A", 40]]) });
ok(!edited[0].prevailingTopUpCents, "edited day: no prevailing top-up");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
