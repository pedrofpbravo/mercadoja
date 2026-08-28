// Service worker: network-first for same-origin files, cache fallback.
// Same pattern as 01. app: network-first avoids the stale-version trap of
// cache-first on an unbundled app while still allowing full offline launch
// of the shell. Firestore data itself lives in the SDK's persistent cache.
//
// DEPLOY RITUAL: bump CACHE below on every deploy.

const CACHE = "mj-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // The Firebase SDK modules come from gstatic and must be available
  // offline too, so they are cached alongside same-origin files.
  const cacheable =
    url.origin === self.location.origin || url.origin === "https://www.gstatic.com";

  if (event.request.method !== "GET" || !cacheable) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
