// Security batch (deploy 25): /api/drive-time needs a signed-in user and is rate limited; rate-limit keys use
// Vercel's trusted client IP, not a client-supplied x-forwarded-for; shared store is used only when configured.
import { clientIp, rateLimitedShared, sharedStore } from "../src/lib/rate-limit";
import { bearerToken, clearAuthCache } from "../src/lib/api-auth";
import { driveTime } from "../src/lib/drive-time-handler";

let fails = 0; const ok = (c: boolean, m: string) => { if (!c) fails++; console.log((c ? "ok " : "FAIL ") + m); };
const req = (headers: Record<string, string>, path = "/api/drive-time?from=30.1,-97.1&to=30.2,-97.2") => new Request(`http://localhost${path}`, { headers });

(async () => {
  // --- rate-limit key ---
  const onVercel = { VERCEL: "1" };
  ok(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "1.2.3.4" }), onVercel) === "1.2.3.4", "x-real-ip wins over a spoofed x-forwarded-for");
  ok(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-vercel-forwarded-for": "5.5.5.5, 9.9.9.9", "x-real-ip": "1.2.3.4" }), onVercel) === "5.5.5.5", "x-vercel-forwarded-for first entry is used");
  ok(clientIp(req({ "x-forwarded-for": "6.6.6.6" }), onVercel) === "unknown", "on Vercel a bare x-forwarded-for is ignored");
  ok(clientIp(req({ "x-forwarded-for": "7.7.7.7, 8.8.8.8" }), {}) === "7.7.7.7", "off Vercel (local) x-forwarded-for is used");
  const spoofA = clientIp(req({ "x-forwarded-for": "10.0.0.1", "x-real-ip": "1.2.3.4" }), onVercel);
  const spoofB = clientIp(req({ "x-forwarded-for": "10.0.0.2", "x-real-ip": "1.2.3.4" }), onVercel);
  ok(spoofA === spoofB, "changing x-forwarded-for does not change the key");

  // --- shared store ---
  ok(sharedStore({}) === null, "no store without env vars");
  ok(sharedStore({ UPSTASH_REDIS_REST_URL: "https://u.example", UPSTASH_REDIS_REST_TOKEN: "t" })?.url === "https://u.example", "Upstash env enables the store");
  ok(sharedStore({ KV_REST_API_URL: "https://kv.example/", KV_REST_API_TOKEN: "t" })?.url === "https://kv.example", "Vercel KV env enables the store");
  let count = 0; const calls: string[] = [];
  const redis: typeof fetch = async (input) => { calls.push(String(input)); count++; return Response.json([{ result: count }, { result: 1 }]); };
  const env = { UPSTASH_REDIS_REST_URL: "https://u.example", UPSTASH_REDIS_REST_TOKEN: "t" };
  const r1 = await rateLimitedShared("k1", 2, 60_000, { env, fetcher: redis });
  const r2 = await rateLimitedShared("k1", 2, 60_000, { env, fetcher: redis });
  const r3 = await rateLimitedShared("k1", 2, 60_000, { env, fetcher: redis });
  ok(!r1 && !r2 && r3 && calls[0] === "https://u.example/pipeline", "shared store counts across calls and limits the 3rd");
  const broken: typeof fetch = async () => { throw new Error("down"); };
  ok((await rateLimitedShared("k2", 5, 60_000, { env, fetcher: broken })) === false, "store down -> in-memory fallback");
  const memA = await rateLimitedShared("k3", 1, 60_000, { env: {} });
  const memB = await rateLimitedShared("k3", 1, 60_000, { env: {} });
  ok(!memA && memB, "no store -> in-memory limit still applies");

  // --- drive-time auth ---
  ok(bearerToken(req({ authorization: "Bearer abc.def" })) === "abc.def" && bearerToken(req({})) === "", "bearer parsing");
  let google = 0, auth = 0;
  const net: typeof fetch = async (input) => {
    const u = String(input);
    if (u.includes("/auth/v1/user")) { auth++; return Response.json({ id: "user-1" }); }
    if (u.includes("maps.googleapis.com")) { google++; return Response.json({ rows: [{ elements: [{ duration: { value: 600 } }] }], results: [{ geometry: { location: { lat: 1, lng: 2 } } }] }); }
    return new Response("", { status: 404 });
  };
  const denyNet: typeof fetch = async (input) => String(input).includes("/auth/v1/user") ? new Response("{}", { status: 401 }) : net(input);
  const denv = { NEXT_PUBLIC_SUPABASE_URL: "https://sb.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", GOOGLE_MAPS_API_KEY: "g", VERCEL: "1" };
  clearAuthCache();
  const noAuth = await driveTime(req({ "x-real-ip": "2.2.2.2" }), { env: denv, fetcher: net });
  ok(noAuth.status === 401 && google === 0, "no session -> 401 and Google is not called");
  const badAuth = await driveTime(req({ "x-real-ip": "2.2.2.2", authorization: "Bearer not-a-real-session-token-xyz" }), { env: denv, fetcher: denyNet });
  ok(badAuth.status === 401 && google === 0, "invalid session -> 401 and Google is not called");
  const geoNoAuth = await driveTime(req({ "x-real-ip": "2.2.2.2" }, "/api/drive-time?geocode=1%20Main"), { env: denv, fetcher: net });
  ok(geoNoAuth.status === 401 && google === 0, "geocode without session -> 401");
  const good = await driveTime(req({ "x-real-ip": "3.3.3.3", authorization: "Bearer valid-session-token-abcdef" }), { env: denv, fetcher: net });
  const body = await good.json();
  ok(good.status === 200 && body.minutes === 10 && body.source === "google" && google === 1, "signed in -> Google drive time");
  await driveTime(req({ "x-real-ip": "3.3.3.3", authorization: "Bearer valid-session-token-abcdef" }), { env: denv, fetcher: net });
  ok(auth === 1, "session check is cached for repeat calls");
  let last = 200;
  for (let i = 0; i < 65; i++) last = (await driveTime(req({ "x-real-ip": `4.4.4.${i % 200}`, authorization: "Bearer valid-session-token-abcdef" }), { env: denv, fetcher: net })).status;
  ok(last === 429, "per-user rate limit -> 429");
  let ipLast = 200;
  for (let i = 0; i < 125; i++) ipLast = (await driveTime(req({ "x-real-ip": "9.9.9.9" }), { env: denv, fetcher: net })).status;
  ok(ipLast === 429, "per-IP rate limit applies even before auth");

  console.log(fails ? `# fail ${fails}` : "# all ok");
  process.exit(fails ? 1 : 0);
})();
