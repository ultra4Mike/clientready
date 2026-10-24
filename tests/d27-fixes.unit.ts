import assert from "node:assert/strict";
import { sandboxOwner, stripeConfigFor, testWebhookSecret } from "../src/lib/stripe-server";
import { embedUrl } from "../src/lib/route";
import { OLD_ROUTE_REDIRECTS } from "../src/lib/view-routes";
import { bizOccurrences } from "../src/lib/business-expenses";

const save = { ...process.env };
process.env.STRIPE_SECRET_KEY = "sk_live_fake";
process.env.STRIPE_TEST_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_TEST_WEBHOOK_SECRET = "whsec_fake";
process.env.STRIPE_TEST_OWNER_IDS = "owner-a, owner-b";
assert.equal(sandboxOwner("owner-b"), true);
assert.equal(sandboxOwner("owner-z"), false);
assert.equal(sandboxOwner(null), false);
assert.equal(stripeConfigFor("owner-a").secretKey.startsWith("sk_test_"), true);
assert.equal(stripeConfigFor("owner-z").secretKey.startsWith("sk_test_"), false);
assert.equal(testWebhookSecret(), "whsec_fake");
process.env.STRIPE_TEST_SECRET_KEY = "sk_live_wrong"; // a live key in the test slot never enables the sandbox
assert.equal(sandboxOwner("owner-a"), false);
assert.equal(testWebhookSecret(), "");
process.env = save;

const keyless = embedUrl(["1 A St, Austin TX", "2 B St, Austin TX", "3 C St, Austin TX"], "");
assert.ok(!keyless.includes("+to:"), "keyless multi-stop must not use the world-zoom +to: form");
assert.ok(embedUrl(["1 A St"], "").includes("q="));
assert.ok(embedUrl(["1 A", "2 B", "3 C"], "KEY").includes("/maps/embed/v1/directions"));
assert.ok(OLD_ROUTE_REDIRECTS.some((r) => r.source === "/myday" && r.destination === "/crew"));
assert.equal(typeof bizOccurrences, "function");
console.log("d27-fixes ok");
