"use strict";

const SHELL_CACHE = "pronounce-shell-v6";
const DATA_CACHE = "pronounce-data-v1";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Google Fonts etc: pass through untouched

  if (url.pathname.includes("/data/")) {
    // static word dataset shards: cache-first (they only change on a new ingest run),
    // and populate the cache as shards get fetched so repeat/offline lookups are instant
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // app shell: cache-first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
