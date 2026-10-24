import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setAsideError } from "../src/lib/profit-alerts";
import { withTimeout } from "../src/lib/passkeys";
import { bookingError } from "../src/lib/booking";
import { telHref, clientMatches, possibleDuplicates, mergeClients, CLIENT_EXPORT_HEADER, clientExportRow, clientChanges, logClientEdit, readClientEdits } from "../src/lib/client-tools";
import { stripPrices, crewJobDetails, crewStatusLabel, inheritJobStatus, doneBlockedReason, hourlyRateOrNull, safeHourlyPay, timeOffError, timeOffDays } from "../src/lib/crew-tools";
import { nextActions } from "../src/lib/timesheet";

let failed = 0;
const pending: Promise<void>[] = [];
const t = (name: string, fn: () => void | Promise<void>) => {
  try { const r = fn(); if (r instanceof Promise) pending.push(r.then(() => console.log("ok", name), (e) => { failed++; console.error("FAIL", name, e); })); else console.log("ok", name); }
  catch (e) { failed++; console.error("FAIL", name, e); }
};

t("set aside 0-100 with visible error", () => { assert.equal(setAsideError("25"), ""); assert.notEqual(setAsideError("150"), ""); assert.notEqual(setAsideError("-1"), ""); });
t("passkey timeout resolves 'timeout'", async () => { assert.equal(await withTimeout(new Promise(() => undefined), 5), "timeout"); assert.equal(await withTimeout(Promise.resolve(1), 50), 1); });
t("booking requires service when offered", () => {
  const form = { name: "Ann", email: "a@b.co", phone: "", address: "", service: "", preferred: "", note: "" };
  assert.match(bookingError(form as never, ["Mow"]), /service/i); assert.doesNotMatch(bookingError(form as never, []) || "", /service/i);
});
t("client tools", () => {
  assert.equal(telHref("(555) 123-4567"), "tel:5551234567");
  assert.ok(clientMatches({ id: "1", phone: "(555) 123-4567" }, "5551234"));
  const list = [{ id: "a", name: "Ann Lee", email: "ann@x.com", phone: "555-123-4567" }];
  assert.deepEqual(possibleDuplicates({ email: "ANN@x.com" }, list)[0].reasons, ["email"]);
  assert.equal(possibleDuplicates({ email: "ann@x.com" }, list, "a").length, 0);
  const m = mergeClients({ id: "a", name: "Ann", notes: "x" } as never, { id: "b", phone: "1", notes: "y" } as never) as { phone?: string; notes?: string };
  assert.equal(m.phone, "1"); assert.equal(m.notes, "x\ny");
  assert.equal(clientExportRow({ id: "a" }).length, CLIENT_EXPORT_HEADER.length);
  assert.ok(CLIENT_EXPORT_HEADER.includes("Next visit"));
  assert.deepEqual(clientChanges({ name: "A" }, { name: "B" }), ["name"]);
  const mem: Record<string, string> = {}; const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  logClientEdit("a", ["name"], "2026-10-24", store); assert.equal(readClientEdits("a", store).length, 1);
});
t("approve page refund wording", () => { const s = readFileSync("src/app/approve/page.tsx", "utf8"); assert.match(s, /No balance due/); assert.match(s, /Balance after refund/); });
t("crew job details carry no prices", () => {
  const d = crewJobDetails({ title: "Deck", data: { items: [{ description: "Stain deck $450", qty: 1, rate: 450 }, { description: "" }] } });
  assert.deepEqual(d, { job_title: "Deck", line_names: ["Stain deck"] });
  assert.equal(stripPrices("Labor 300 USD, trim"), "Labor, trim");
});
t("crew status labels + inherited status", () => {
  assert.equal(crewStatusLabel("done", false), "Done · awaiting confirmation");
  assert.equal(crewStatusLabel(undefined), "Scheduled");
  const out = inheritJobStatus([{ doc_id: "d", scheduled: true, schedule_status: "done", done_confirmed: false }, { doc_id: "d", scheduled: false }]);
  assert.equal(out[1].schedule_status, "done");
});
t("done blocked says why; photo optional setting", () => {
  assert.match(doneBlockedReason({ photos: 0 }), /photo/i);
  assert.equal(doneBlockedReason({ photos: 0, photoOptional: true }), "");
  assert.match(doneBlockedReason({ photos: 1, checklistLeft: 2 }), /2 left/);
});
t("Start day stays after End day", () => { assert.equal(nextActions("OFF_DUTY", { tapsToday: 3 }).find((a) => a.primary)?.kind, "start_day"); });
t("blank pay rate never breaks pay math", () => {
  assert.equal(hourlyRateOrNull(""), null); assert.equal(hourlyRateOrNull("$24"), 24); assert.equal(hourlyRateOrNull("abc"), null);
  assert.equal(safeHourlyPay(8, ""), 0); assert.equal(safeHourlyPay(2, "20"), 40);
});
t("time off validation", () => {
  assert.equal(timeOffError({ start: "2026-11-02", end: "2026-11-03" }, "2026-10-24"), "");
  assert.match(timeOffError({ start: "2026-11-03", end: "2026-11-02" }), /before/);
  assert.equal(timeOffDays("2026-11-02", "2026-11-04"), 3);
});
t("GPS fallback flags and crew UI wiring", () => {
  const day = readFileSync("src/components/crew/MyDay.tsx", "utf8"); assert.match(day, /gps-locating/); assert.match(day, /saved without it and flagged/);
  const crew = readFileSync("src/app/crew/page.tsx", "utf8"); assert.match(crew, /navigate-\$\{card\.doc_id\}/); assert.match(crew, /done-blocked-/); assert.match(crew, /CrewTimeOff/);
  assert.doesNotMatch(readFileSync("src/components/StripeSetup.tsx", "utf8"), /STRIPE_SECRET_KEY/);
});

Promise.all(pending).then(() => { if (failed) { console.error(`${failed} failed`); process.exit(1); } });
