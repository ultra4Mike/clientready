// Item 2: repeat drags of a multi-day change order. Run with tsx.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { keepNewerSchedule } from "../src/lib/cloud-docs";

let n = 0; const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const src = readFileSync("src/components/views/CalendarGridView.tsx", "utf8");
const drop = src.slice(src.indexOf("function dropOn("), src.indexOf("function chip("));
ok(/const stored = readDocs\(\)/.test(drop), "dropOn reads the stored list at drop time");
ok(drop.indexOf("readDocs()") < drop.indexOf("docs.find("), "doc is looked up in the fresh list");
ok(!/if \(!doc\) return;/.test(drop), "a missing doc no longer returns silently");
ok(/Not moved: this job changed/.test(drop), "a missing doc tells the user");

// Back-drag: my move (newer stamp) back to a date the base held must beat the cloud's older position.
const mine = { schedule: { date: "2026-10-26", updatedAt: "2026-10-23T10:05:00Z", days: [{ date: "2026-10-27" }] },
  crew: [{ id: "r1", workDate: "2026-10-26", startTime: "09:00", endTime: "12:00", hours: "3", rate: "20" }] };
const merged = { schedule: { date: "2026-10-19", updatedAt: "2026-10-23T10:00:00Z" },
  crew: [{ id: "r1", workDate: "2026-10-19", startTime: "09:00", endTime: "12:00", hours: "3", rate: "25" }] };
const out = keepNewerSchedule(mine, merged, merged.schedule) as { schedule: typeof mine.schedule; crew: Record<string, string>[] };
ok(out.schedule.date === "2026-10-26", "newer local schedule kept");
ok(out.crew[0].workDate === "2026-10-26", "crew date follows the kept schedule");
ok(out.crew[0].rate === "25" && out.crew[0].hours === "3", "pay fields stay as merged (pay math untouched)");
const older = keepNewerSchedule(mine, merged, { updatedAt: "2026-10-23T11:00:00Z" });
ok(Object.keys(older).length === 0, "a newer cloud schedule (crew update) still wins");
ok(Object.keys(keepNewerSchedule({}, merged, merged.schedule)).length === 0, "no local schedule: nothing forced");
console.log(`calendar-repeat-drag: ${n} checks passed`);
