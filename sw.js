// Incrémenter VERSION à chaque déploiement pour invalider le cache.
const VERSION = "v1";
const CACHE = `nozdormu-${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "src/app.js",
  "src/announce.js",
  "src/audio.js",
  "src/engine.js",
  "src/format.js",
  "src/store.js",
  "src/timeline.js",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Cache d'abord : l'appli démarre hors ligne.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(event.request)));
});
