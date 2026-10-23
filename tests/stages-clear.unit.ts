// Stages display: summary line, per-row paid/left/due text (display only).
import { asAmountStage, stagePlan, stageRowText, stageSummary, readStages } from "@/lib/stages";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const st = readStages([
  { id: "d", label: "Deposit", kind: "deposit", mode: "percent", value: "30", dueDate: "2026-10-25" },
  { id: "p", label: "Progress", kind: "progress", mode: "percent", value: "40", dueDate: "2026-10-28" },
  { id: "f", label: "Final", kind: "final", mode: "percent", value: "30", dueDate: "2026-11-10" },
]);
const s = stageSummary(1000, 750, st);
ok(s.text === "Invoice total $1,000.00 · Stages add up to $1,000.00 (100%) · Paid $250.00 · Still owed $750.00" && !s.warn, s.text);
const rows = stagePlan(1000, 750, st, "2026-10-23").rows.map(stageRowText);
ok(rows[0] === "$300.00 · $250.00 paid · $50.00 left · Due Oct 25", rows[0]);
ok(rows[1] === "$400.00 · $400.00 left · Due Oct 28", rows[1]);
ok(stageRowText(stagePlan(1000, 600, st, "2026-10-23").rows[0]) === "$300.00 · Paid in full", "covered stage reads Paid in full");
const off = stageSummary(1000, 750, readStages([{ id: "d", kind: "deposit", mode: "percent", value: "30", dueDate: "" }, { id: "p", kind: "progress", mode: "percent", value: "40", dueDate: "" }]));
ok(/70%/.test(off.text) && /\$300\.00 not scheduled/.test(off.warn), off.warn);
ok(stageSummary(1000, 750, readStages([{ id: "a", kind: "deposit", mode: "amount", value: "1200", dueDate: "" }])).warn.includes("$200.00 too much"), "over 100% warns");
ok(JSON.stringify(asAmountStage(st[0], 300)) === JSON.stringify({ ...st[0], mode: "amount", value: "300.00" }) && asAmountStage(st[2], 300).value === "30.00".replace("30.00","300.00") && asAmountStage({ ...st[2], value: "" }, 300).value === "", "percent -> $ only via asAmountStage; rest final stays blank");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
