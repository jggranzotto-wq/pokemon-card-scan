const CACHE = "card-scan-shell-v3";
// Icons and the offline page only. Caching /, /scan, or /settings stores HTML that
// Next can receive instead of an RSC payload, which hard-reloads the open scan.
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  // Do not clients.claim(). Taking control of the open page fires controllerchange
  // and reloads /scan while /api/identify is still in flight.
});

function isDocumentOrAppRequest(request, url) {
  if (request.mode === "navigate" || request.destination === "document") return true;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/") || url.pathname === "/sw.js") return true;
  if (request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch") || request.headers.has("Next-Router-State-Tree")) {
    return true;
  }
  return url.searchParams.has("_rsc");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isDocumentOrAppRequest(request, url)) {
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match("/offline.html")) || Response.error()),
      );
    }
    return;
  }

  if (!url.pathname.startsWith("/icons/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
