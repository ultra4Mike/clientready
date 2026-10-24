// pt437u: opening the Timesheet must never flash old "needs review"/no-show names before approvals load.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { pendingSurfaces, splitAlerts, statusChip, LOADING_LABEL, mergeApprovals } from "../src/lib/timesheet-alerts";
import { readLocalApprovals } from "../src/lib/day-events";

let n = 0; const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } };
(globalThis as Record<string, unknown>).localStorage = (globalThis as { window: { localStorage: unknown } }).window.localStorage;
const keys = readFileSync("src/lib/day-events.ts", "utf8").match(/KEY_APPROVALS\s*=\s*"([^"]+)"/);
const key = keys ? keys[1] : "";
ok(key, "approvals cache key found");
store.set(key, JSON.stringify([{ employeeId: "e2", date: "2026-10-20", paidMinutes: 480, driveMinutes: 0, editedMinutes: null, approvedAt: "2026-10-21T10:00:00Z", changedAt: null }]));

// First render: approvals still loading (slow), cached approval applied.
const cached = mergeApprovals(readLocalApprovals("2026-10-19", "2026-10-25"), []);
ok(cached.length === 1 && cached[0].approvedAt, "cached approval is used first");
const all = [
  { key: "no_show-e2-2026-10-20", kind: "no_show", employeeId: "e2", date: "2026-10-20", text: "QA Worker · 2026-10-20: no-show", open: "e2|2026-10-20" },
  { key: "flag-e3-2026-10-21", employeeId: "e3", date: "2026-10-21", text: "Other Worker · 2026-10-21 needs review", open: "e3|2026-10-21" },
];
const split = splitAlerts(all, (id, d) => Boolean(cached.find((a) => a.employeeId === id && a.date === d)?.approvedAt));
ok(!split.open.some((a) => a.employeeId === "e2"), "cached approved day is never an open alert");
const first = pendingSurfaces(true, { alerts: split.open, resolved: split.resolved, reviewCount: 3, readyCount: 2, orphans: ["x"] });
ok(first.alerts.length === 0 && first.resolved.length === 0, "first render: no alerts, no names");
ok(first.reviewCount === 0 && first.readyCount === 0 && first.orphans.length === 0, "first render: no counts or orphan notice");
ok(!JSON.stringify(first).includes("QA Worker") && !JSON.stringify(first).includes("Other Worker"), "no worker names at all while loading");
ok(statusChip(true, { kind: "review", label: "Needs review (2)" }).label === LOADING_LABEL, "status chip is neutral while loading");
const done = pendingSurfaces(false, { alerts: split.open, resolved: split.resolved, reviewCount: 1, readyCount: 0, orphans: [] });
ok(done.alerts.length === 1 && done.reviewCount === 1, "after load the real open alerts show");

// The page routes every pending surface through the gate.
const page = readFileSync("src/app/timesheet/page.tsx", "utf8");
ok(/pendingSurfaces\(weekLoading/.test(page), "page gates on the week load");
ok(/Approve all ready \(\{gate\.loading \? LOADING_LABEL/.test(page), "Approve all ready shows a placeholder");
ok(/statusChip\(gate\.loading/.test(page), "worker chips use the placeholder");
ok(/!gate\.loading && d\.flagged/.test(page), "day ! flags wait for the load");
ok((page.match(/split\.open/g) || []).length === 1 && /alerts: split\.open/.test(page), "open alerts only reach the UI via the gate");
ok(/setApprovals\(mergeApprovals\(readLocalApprovals/.test(page), "cached approvals are applied before the server read");
console.log(`timesheet-no-flash: ${n} checks passed`);
