const CACHE_NAME = "basket-clock-v21";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./audio/half.mp3",
  "./audio/one-minute.mp3",
  "./audio/thirty.mp3",
  "./audio/no-time.mp3",
  "./audio/10.mp3",
  "./audio/9.mp3",
  "./audio/8.mp3",
  "./audio/7.mp3",
  "./audio/6.mp3",
  "./audio/5.mp3",
  "./audio/4.mp3",
  "./audio/3.mp3",
  "./audio/2.mp3",
  "./audio/1.mp3",
  "./audio/end.mp3"
];

function appUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

function indexRequest() {
  return new Request(appUrl("./index.html"), { cache: "reload" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((path) => new Request(appUrl(path), { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.disable()
        : Promise.resolve()
    ]).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(indexRequest()).then((cachedIndex) => {
          if (cachedIndex) return cachedIndex;
          return cache.match(appUrl("./")).then((cachedRoot) => {
            if (cachedRoot) return cachedRoot;
            return fetch(event.request)
              .then((response) => {
                cache.put(indexRequest(), response.clone());
                return response;
              })
              .catch(() => new Response("Offline cache is not ready.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
              }));
          });
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request)
          .then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => cache.match(indexRequest()));
      })
    )
  );
});
