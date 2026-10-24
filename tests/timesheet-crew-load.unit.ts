// Timesheet empty state: signed out / loading / error must never say "No crew yet"; footer points to Settings.
import { readFileSync } from "node:fs";
import { timesheetEmptyKind } from "@/lib/timesheet-crew-state";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
ok(timesheetEmptyKind("signed_out", 0, "all") === "signed_out", "signed out with no cached crew says signed out");
ok(timesheetEmptyKind("loading", 0, "all") === "loading", "still loading is not 'No crew yet'");
ok(timesheetEmptyKind("error", 0, "all") === "error", "cloud read failed says so");
ok(timesheetEmptyKind("ready", 0, "all") === "no_crew", "only a real empty Team says No crew yet");
ok(timesheetEmptyKind("ready", 5, "review") === "review_clear", "review filter with crew");
ok(timesheetEmptyKind("signed_out", 5, "all") === "none", "cached crew still shows when signed out");
const page = readFileSync("src/app/timesheet/page.tsx", "utf8");
ok(/refreshEmployeesCache\(/.test(page), "timesheet reads crew from the server, not only the Team cache");
ok(/href="\/profile#overtime"[^>]*>Settings</.test(page), "footer links to Settings");
ok(/ts-footer-how/.test(page) && /How hours are counted/.test(page), "footer has How hours are counted");
ok(!/loadBusinessTz\(\)\.then\(\(\) => syncTimesheetCutover\(\)\)/.test(page), "zone and cutover are not chained before render");
ok(page.indexOf("setWorkers(readWorkers())") < page.indexOf("void loadBusinessTz()"), "cached crew renders before any network wait");
ok(/week && days\.length \? weekShares/.test(page), "pay shares wait for a week (no crash when crew loads first)");
ok(/weekLoading\) return;/.test(page) && /data-testid="ts-loading"/.test(page), "no job estimates pushed while loading; visible loading line");
if (fails) { console.log(`${fails} failed`); process.exit(1); } else console.log("all passed");
