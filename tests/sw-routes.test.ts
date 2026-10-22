/** public/sw.js precaches every app page except the documented exclusions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const sw = readFileSync("public/sw.js", "utf8");
const list = (name: string) => JSON.parse(sw.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`))![1].replace(/,\s*\]/, "]")) as string[];

function pages(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pages(full, entry.startsWith("(") ? base : `${base}/${entry}`));
    else if (entry === "page.tsx") out.push(base || "/");
  }
  return out;
}

test("every page in src/app is warmed or deliberately excluded", () => {
  const warm = new Set(list("WARM_PAGES"));
  const noCache = list("NO_CACHE_PAGES");
  const excluded = new Set([...noCache, "/auth/callback", "/reset-password", "/offline"]);
  const missing = pages("src/app").filter((p) => !warm.has(p) && !excluded.has(p) && !p.includes("["));
  assert.deepEqual(missing, []);
  for (const p of warm) assert.ok(!noCache.some((n) => p === n || p.startsWith(`${n}/`)), `${p} must not be cached`);
  assert.match(sw, /const VERSION = "cr-v3"/);
  assert.match(sw, /startsWith\("\/api\/"\)\) return;/, "API never cached");
  assert.match(sw, /url\.origin !== self\.location\.origin/, "Supabase/cross-origin never cached");
});
