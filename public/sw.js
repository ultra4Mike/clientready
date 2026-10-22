/* ClientReady service worker: offline app shell + push display. Never caches API calls, Supabase
   responses or anything cross-origin, so business data only lives in the app's own storage. */
const VERSION = "cr-v3";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const PRECACHE = ["/offline", "/icons/icon-192.png"];
// Every app page is kept ready for no-signal use even if never opened online on this device (best effort:
// a failure here never blocks install). Their /_next/static scripts and styles are cached too.
// Field pages go first. Excluded: NO_CACHE_PAGES (token pages), /auth/callback and /reset-password (one-time
// auth links), /offline (in PRECACHE) and dynamic /clients/[id] (cached when opened).
// tests/sw-routes.test.ts fails if a page in src/app is missing here and not excluded.
const WARM_PAGES = [
  "/crew", "/calendar", "/job", "/route", "/report", "/receipt", "/mileage",
  "/", "/dashboard", "/invoice", "/proposal", "/documents", "/clients", "/employees", "/collect",
  "/reports", "/backup", "/inventory", "/email", "/integrations", "/settings", "/profile",
  "/plans", "/subscribe", "/help", "/developers", "/privacy", "/terms", "/login", "/signup",
];

async function warm(path) {
  try {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok || response.type !== "basic") return;
    const html = await response.clone().text();
    await (await caches.open(SHELL)).put(self.location.origin + path, response);
    const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
    const statics = await caches.open(STATIC);
    await Promise.all(assets.map(async (url) => { if (!(await statics.match(url))) await statics.add(url).catch(() => undefined); }));
  } catch {
    // offline during install: the page is cached the first time it is opened online instead
  }
}
// Six at a time so a phone on a weak signal isn't flooded during install.
async function warmAll() {
  for (let i = 0; i < WARM_PAGES.length; i += 6) await Promise.all(WARM_PAGES.slice(i, i + 6).map(warm));
}
// Public token pages show someone else's document; don't keep copies of them.
const NO_CACHE_PAGES = ["/approve", "/portal", "/invoice-view", "/account/delete"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => warmAll()).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-caches") event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
});

async function page(request) {
  const url = new URL(request.url);
  const key = url.origin + url.pathname; // pages are client-rendered shells; ?id= etc. is read in the browser
  const keep = !NO_CACHE_PAGES.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
  try {
    const response = await fetch(request);
    if (keep && response.ok && response.type === "basic") {
      const cache = await caches.open(SHELL);
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    return (keep && (await cache.match(key))) || (await cache.match("/offline")) || Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") return event.respondWith(page(request));
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) return event.respondWith(asset(request));
});

/* Push: shows what the server sent (title/body/url). Only same-origin links are opened. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = String(data.title || "ClientReady").slice(0, 80);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(data.body || "").slice(0, 240),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag ? String(data.tag) : undefined,
    data: { url: typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/calendar?view=day" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/calendar?view=day", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const open = windows.find((client) => client.url === target);
    return open ? open.focus() : self.clients.openWindow(target);
  }));
});
