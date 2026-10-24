import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const seen = new Set<string>();
for (const f of ["src/app/page.tsx", "src/app/plans/page.tsx", "src/app/help/page.tsx", "src/app/signup/page.tsx"]) {
  const s = readFileSync(f, "utf8");
  assert.ok(!s.includes('"use client"'), f);
  const t = s.match(/const title = "([^"]+)"/)![1], d = s.match(/const description = "([^"]+)"/)![1];
  assert.ok(!seen.has(t) && !seen.has(d), "unique " + f); seen.add(t); seen.add(d);
  assert.ok(d.length >= 50 && d.length <= 170, "desc length " + f);
  assert.ok(/openGraph: \{[^}]*title, description/.test(s), "og " + f);
}
console.log("seo ok");
