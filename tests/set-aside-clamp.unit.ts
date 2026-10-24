import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clampPercentText } from "../src/lib/profit-alerts";
assert.equal(clampPercentText("150"), "100"); assert.equal(clampPercentText("-5"), "0");
assert.equal(clampPercentText("25.5"), "25.5"); assert.equal(clampPercentText(""), ""); assert.equal(clampPercentText("abc"), "abc"); assert.equal(clampPercentText(" 100 "), "100");
assert.ok(readFileSync("src/app/profile/page.tsx", "utf8").includes('placeholder="30 (default)"'));
console.log("set-aside ok");
