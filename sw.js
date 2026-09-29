const APP_CACHE = "shanghai-app-v39";
const MAP_CACHE = "shanghai-map-v2";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./places.js",
  "./list-descriptions.js",
  "./app.js",
  "./manifest.webmanifest",
  "./manifest-dark.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/logo-bright.png",
  "./icons/logo-dark.png",
  "./icons/favicon-bright-192.png",
  "./icons/favicon-bright-512.png",
  "./icons/favicon-dark-192.png",
  "./icons/favicon-dark-512.png",
  "./icons/apple-touch-bright.png",
  "./icons/apple-touch-dark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES);
    // Cache the MapLibre browser build locally as part of app installation.
    const library = await fetch("https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js");
    const stylesheet = await fetch("https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css");
    if (!library.ok || !stylesheet.ok) throw new Error("MapLibre n'a pas pu être téléchargé.");
    await cache.put(new URL("./vendor/maplibre-gl.js", self.registration.scope), library);
    await cache.put(new URL("./vendor/maplibre-gl.css", self.registration.scope), stylesheet);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (![APP_CACHE, MAP_CACHE].includes(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function proxyMapResource(request) {
  const requestUrl = new URL(request.url);
  const remoteUrl = requestUrl.searchParams.get("url");
  if (!remoteUrl || new URL(remoteUrl).protocol !== "https:" || new URL(remoteUrl).hostname !== "tiles.openfreemap.org") {
    return new Response("Adresse de carte invalide", { status: 400 });
  }
  const cache = await caches.open(MAP_CACHE);
  const cached = await cache.match(request);
  try {
    const response = await fetch(remoteUrl);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cached || new Response("Cette ressource cartographique n'est pas disponible hors ligne.", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const proxyPath = new URL("./ofm-proxy", self.registration.scope).pathname;
  if (url.origin === self.location.origin && url.pathname === proxyPath) {
    event.respondWith(proxyMapResource(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && (request.destination === "image" || url.pathname.includes("/photos/"))) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      return Response.error();
    }
  })());
});
