import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mayPreview, parseCrewPreview, previewClockTap, readPreviewClock, sampleJobs, stripPay, CREW_PREVIEW_KEY } from "../src/lib/crew-preview";
import { resolvePortalTheme } from "../src/lib/portal-theme";
import { sourceDepositPercent } from "../src/lib/stages";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// 1. Payment plan uses the source proposal's deposit %
{
  const docs = [{ id: "p1", data: { depositPercent: "40" } }] as never;
  assert.equal(sourceDepositPercent({ id: "p1", number: "P-1", depositPercent: "25" } as never, docs), 25);
  assert.equal(sourceDepositPercent({ id: "p1", number: "P-1" } as never, docs), 40);
  assert.equal(sourceDepositPercent(null as never, docs), 0);
  const ed = src("src/components/StageSchedule.tsx");
  assert.match(ed, /depositPercent > 0 && depositPercent < 100 \? depositPercent : 30/);
}
// 2 + 3. Status shows Paid when fully paid; new payment rows start blank
{
  const inv = src("src/app/invoice/page.tsx");
  assert.match(inv, /value=\{effStatus\}/); // QA2c: the shared effective-status helper replaced the inline rule
  assert.match(inv, /amount: "", method: "", date: ymd\(new Date\(\)\)/);
  assert.doesNotMatch(inv, /method: "Cash", date: ymd/);
  assert.match(inv, /payment-fill-suggested/);
}
// 4. Portal theme
{
  assert.equal(resolvePortalTheme(null, true), "dark");
  assert.equal(resolvePortalTheme("system", false), "light");
  assert.equal(resolvePortalTheme("light", true), "light");
  assert.match(src("src/app/layout.tsx"), /clientready-portal-theme/);
  for (const r of ["portal", "approve", "collect", "receipt"]) assert.match(src(`src/app/${r}/layout.tsx`), /PortalThemeToggle/);
}
// 5. Preview as crew
{
  assert.deepEqual(parseCrewPreview("?preview=sample"), { mode: "sample" });
  assert.deepEqual(parseCrewPreview("?preview=e1"), { mode: "worker", employeeId: "e1" });
  assert.deepEqual(parseCrewPreview("?preview=%27;drop"), { mode: "sample" });
  assert.equal(parseCrewPreview(""), null);
  assert.equal(mayPreview("u1", null), true);
  assert.equal(mayPreview("u1", { user_id: "u1" }), true);
  assert.equal(mayPreview("u1", { user_id: "other-owner" }), false);
  assert.equal(mayPreview("", null), false);
  for (const j of sampleJobs("2026-10-24")) { assert.equal(j.pay, 0); assert.equal(j.rate, ""); }
  assert.equal(stripPay({ pay: 90, rate: "30" }).pay, 0);
  const mem = new Map<string, string>();
  const store = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) };
  previewClockTap("clock-in", "d1", "2026-10-24T14:00:00Z", store);
  previewClockTap("clock-in", "d1", "2026-10-24T14:01:00Z", store);
  const rows = previewClockTap("clock-out", "d1", "2026-10-24T15:00:00Z", store);
  assert.equal(rows.length, 1); assert.equal(rows[0].ended_at, "2026-10-24T15:00:00Z");
  assert.ok(mem.has(CREW_PREVIEW_KEY)); assert.equal(readPreviewClock(store).length, 1);
  const crew = src("src/app/crew/page.tsx");
  assert.match(crew, /if \(preview\) \{\n\s+if \(kind === "clock-in"/);
  assert.match(crew, /crew-preview-banner/);
  assert.match(crew, /email && !preview && <MyDay/);
}
console.log("qa2b-fixes ok");
