"use strict";

const root = new URL(self.registration.scope);
const cachePrefix = "pocket-ledger-demo:" + root.pathname + ":";
const cacheName = cachePrefix + "20261125-1";
const shell = new URL("./index.html", root).href;
const probePath = new URL("./connectivity.txt", root).pathname;
const assets = [
  "./index.html", "./style.css", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"
].map((path) => new URL(path, root).href);
const assetSet = new Set(assets);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(assets.map((asset) => new Request(asset, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(stale.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== root.origin || url.pathname === probePath) return;

  const navigation = request.mode === "navigate" &&
    (url.pathname === root.pathname || url.pathname === new URL(shell).pathname);
  if (navigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
        const cache = await caches.open(cacheName);
        return (await cache.match(shell)) || response;
      } catch {
        const cache = await caches.open(cacheName);
        return (await cache.match(shell)) || Response.error();
      }
    })());
    return;
  }

  if (!assetSet.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(request)) || fetch(request);
  })());
});
