// Crew/time fixes: re-opened day timeline order, "(was …)" after edits, account-wide PTO settings.
import { applyFixes, buildDay, dayTimeline, readTimesheetSettings, DEFAULT_TIMESHEET_SETTINGS, type FixRequest, type TapEvent } from "@/lib/timesheet";
import { mergePto, ptoPresetPatch, ptoPreview } from "@/components/timesheet/PtoRulesFields";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const d = "2026-10-21"; const t = (h: string) => new Date(`${d}T${h}:00-05:00`).toISOString();
const ev = (id: string, kind: TapEvent["kind"], h: string, docId?: string): TapEvent => ({ id, employeeId: "e", date: d, kind, at: t(h), docId });
const day = (events: TapEvent[]) => buildDay({ employeeId: "e", date: d, events, schedule: [], now: t("18:00"), settings: DEFAULT_TIMESHEET_SETTINGS });

// 1) Re-opened session: rows in time order, gap reads as off duty between the sessions, one final "Day ended".
const taps = [ev("1", "start_day", "08:00"), ev("2", "start_job", "08:10", "A"), ev("3", "end_day", "12:00"), ev("4", "start_day", "13:00"), ev("5", "start_job", "13:05", "B"), ev("6", "end_day", "17:00")];
const rows = dayTimeline(day(taps), taps);
ok(rows.every((r, i) => i === 0 || r.at >= rows[i - 1].at), "timeline sorted by time");
const gapI = rows.findIndex((r) => /re-opened/.test(r.text));
ok(gapI > 0 && rows.slice(0, gapI).some((r) => r.kind === "end") && rows.slice(gapI + 1).some((r) => r.kind === "start"), "off-duty gap sits between end and re-open");
ok(rows.filter((r) => /re-opened/.test(r.text)).length === 1, "gap shown once");
ok(/Day ended/.test(rows[rows.length - 1].text), `last row is Day ended (${rows[rows.length - 1].text})`);

// 2) "(was …)" keeps the original tap after two approved fixes, newest decision wins.
const fix = (id: string, at: string, decidedAt: string): FixRequest => ({ id, employeeId: "e", date: d, eventId: "1", kind: "start_day", at: t(at), reason: "x", status: "approved", createdAt: decidedAt, decidedAt });
const fixed = applyFixes(taps, [fix("b", "07:30", "2026-10-22T10:00:00Z"), fix("a", "07:45", "2026-10-22T09:00:00Z")]);
const s1 = fixed.find((e) => e.id === "1")!;
ok(s1.at === t("07:30") && s1.wasAt === t("08:00"), "two fixes: newest time, original wasAt");
ok(applyFixes(taps, []).every((e) => !e.wasAt), "no fixes: no wasAt");

// 3) Account-wide PTO settings.
const def = readTimesheetSettings({});
ok(def.ptoDayHours === 8 && def.ptoRequestsOn === true, "defaults: 8 h day, requests on");
const r = readTimesheetSettings({ ptoDayHours: 10, ptoRequestsOn: false, ptoPreset: "california" });
ok(r.ptoDayHours === 10 && r.ptoRequestsOn === false && r.ptoPerHours === 30 && r.ptoCapHours === 80, "saved values read back; California rules kept");
ok(readTimesheetSettings({ ptoDayHours: 40 }).ptoDayHours === 8, "bad day hours fall back to 8");
ok(ptoPresetPatch("california").ptoUseCapHours === 40 && ptoPresetPatch("off").ptoPerHours === 0, "preset patches unchanged");
ok(ptoPreview({ ...def, ptoPreset: "custom", ptoPerHours: 40, ptoCapHours: 48 }) === "1 h earned per 40 h worked, up to 48 h.", "preview text");
const merged = mergePto({ ...def, weeklyOtHours: 44, minWage: 16.9 }, { ...def, weeklyOtHours: 40, ptoPreset: "custom", ptoPerHours: 20, ptoDayHours: 7 });
ok(merged.weeklyOtHours === 44 && merged.minWage === 16.9 && merged.ptoPerHours === 20 && merged.ptoDayHours === 7, "Settings save touches only PTO keys");

console.log(fails ? `${fails} FAILED` : "all ok"); process.exit(fails ? 1 : 0);
