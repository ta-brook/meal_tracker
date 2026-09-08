const CACHE = "meal-tracker-v2";
const SHELL = [
  "/",
  "/manifest.json",
  "/static/app.js",
  "/static/style.css",
  "/static/icons/icon-192.png",
  "/static/icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") return caches.match("/");
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(networkFirst(req));
});
