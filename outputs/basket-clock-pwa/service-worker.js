const CACHE_NAME = "basket-clock-v22";
const INDEX_PATH = "./index.html";

const APP_SHELL = [
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
  return new URL(path, self.registration.scope).href;
}

function requestFor(path) {
  return new Request(appUrl(path), { cache: "reload" });
}

function cleanHtmlResponse(responseText) {
  return new Response(responseText, {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
}

async function fetchCleanIndex() {
  const response = await fetch(appUrl(INDEX_PATH), {
    cache: "reload",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`index.html fetch failed: ${response.status}`);
  }

  return cleanHtmlResponse(await response.text());
}

async function putCleanIndex(cache) {
  const cleanIndex = await fetchCleanIndex();
  await cache.put(appUrl(INDEX_PATH), cleanIndex.clone());
  return cleanIndex;
}

async function getCachedCleanIndex(cache) {
  const candidates = [
    appUrl(INDEX_PATH),
    INDEX_PATH,
    "index.html"
  ];

  for (const candidate of candidates) {
    const cached = await cache.match(candidate);
    if (cached && !cached.redirected) {
      return cached;
    }
  }

  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (path) => {
          if (path === INDEX_PATH) {
            await putCleanIndex(cache);
            return;
          }

          await cache.add(requestFor(path));
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith("basket-clock"))
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
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedIndex = await getCachedCleanIndex(cache);
        if (cachedIndex) return cachedIndex;

        try {
          return await putCleanIndex(cache);
        } catch {
          return cleanHtmlResponse("<!doctype html><title>Basket Clock</title><body>Offline cache is not ready.</body>");
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse && !cachedResponse.redirected) return cachedResponse;

        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse.redirected) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() =>
            getCachedCleanIndex(cache).then((cachedIndex) =>
              cachedIndex || cleanHtmlResponse("<!doctype html><title>Basket Clock</title><body>Offline cache is not ready.</body>")
            )
          );
      })
    )
  );
});
