// Service worker: keeps the app usable offline. Files are served from the cache and refreshed
// from the network in the background, so a new version is picked up on the next launch.

const CACHE = "spotter-v7";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/charts.js", "js/db.js", "js/history.js", "js/library.js", "js/program.js", "js/progression.js",
  "js/state.js", "js/strong.js", "js/sync.js", "js/ui.js", "js/workout.js",
  "js/views/library-view.js", "js/views/log.js", "js/views/muscles.js", "js/views/progress.js", "js/views/settings.js",
  "js/views/sheet.js", "js/views/today.js", "js/views/workout-view.js",
  "data/exercises.csv", "data/patterns.csv", "data/splits.json", "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    const fresh = fetch(event.request).then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh;
  }));
});
