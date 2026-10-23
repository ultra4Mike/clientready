// Regression: due-date sync only ever touches the header Due date and Final stages on the old date; never blanks a stage or changes payments.
import { followDueDate, readStages } from "@/lib/stages";
import { effectiveDueDate } from "@/lib/payments";
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const stages = readStages([
  { id: "d", label: "QA Deposit", kind: "deposit", mode: "amount", value: "300", dueDate: "2026-10-25" },
  { id: "p", label: "Progress", kind: "progress", mode: "amount", value: "400", dueDate: "2026-10-28" },
  { id: "f", label: "Final", kind: "final", mode: "amount", value: "300", dueDate: "2026-11-10" },
]);
const data = { dueDate: "2026-10-19", stages, payments: [{ id: "p1", amount: "250", method: "Cash", date: "2026-10-24" }] };
const before = JSON.stringify(data);
ok(effectiveDueDate(data) === "2026-11-10" && JSON.stringify(data) === before, "load sync reads only; stages/payments unchanged");
const moved = followDueDate(stages, "2026-11-10", "2026-11-20");
ok(moved[0].dueDate === "2026-10-25" && moved[1].dueDate === "2026-10-28" && moved[2].dueDate === "2026-11-20", "header edit moves only Final");
ok(followDueDate(stages, "2026-10-19", "2026-11-20") === stages, "header edit from an unrelated date moves nothing");
ok(followDueDate(stages, "2026-10-25", "") === stages && followDueDate(stages, "", "2026-12-01") === stages, "never blanks; no-op on empty values");
ok(followDueDate(stages, "2026-10-25", "2026-10-30")[0].dueDate === "2026-10-25", "deposit sharing a date is never moved");
console.log(fails ? `FAILED ${fails}` : "ALL PASS");
