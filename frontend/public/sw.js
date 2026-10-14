/**
 * SKYRA – Progressive Web App Service Worker (v1.0.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Enables offline application reloading, app-shell caching, asset resilience,
 * and emergency guidance availability during internet and network outages.
 */

const STATIC_CACHE_NAME = "skyra-static-v1";
const TILE_CACHE_NAME = "skyra-tiles-v1";
const DATA_CACHE_NAME = "skyra-data-v1";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/icons.svg",
  "/manifest.webmanifest",
  "/models/xgboost_risk_model.json",
];

// ── Install: Precache App Shell ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SKYRA SW] Precache partial error (non-fatal):", err);
      });
    })
  );
});

// ── Activate: Clean up Obsolete Caches ────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (
              key !== STATIC_CACHE_NAME &&
              key !== TILE_CACHE_NAME &&
              key !== DATA_CACHE_NAME
            ) {
              console.log("[SKYRA SW] Purging obsolete cache:", key);
              return caches.delete(key);
            }
          })
        );
      }),
    ])
  );
});

// ── Fetch Handler: Tiered Caching Strategy ───────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. NEVER intercept non-GET requests (POST, PUT, DELETE must bypass SW)
  if (request.method !== "GET") {
    return;
  }

  // 2. Navigation requests (HTML Pages / Routes like /dashboard, /app)
  // Network-First with fallback to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedNavigate = await caches.match(request);
          if (cachedNavigate) return cachedNavigate;
          const cachedShell = await caches.match("/index.html");
          if (cachedShell) return cachedShell;
          return new Response("SKYRA is currently offline. Please reconnect.", {
            headers: { "Content-Type": "text/html" },
          });
        })
    );
    return;
  }

  // 3. Map Tile Requests (OpenStreetMap, OpenTopoMap)
  if (
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("tile.opentopomap.org")
  ) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cachedTile = await cache.match(request);
        if (cachedTile) return cachedTile;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // If offline and tile not cached, return transparent 1x1 fallback tile or let Leaflet handle
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#131b2e"/><text x="128" y="128" fill="#475569" font-family="sans-serif" font-size="12" text-anchor="middle" dominant-baseline="middle">Tile not cached offline</text></svg>',
            { headers: { "Content-Type": "image/svg+xml" } }
          );
        }
      })
    );
    return;
  }

  // 4. Vite Static Assets (JS, CSS, SVGs, Fonts)
  // Cache-First with Stale-While-Revalidate
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => null);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 5. Read-only Weather/Health/Public GET API fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful GET responses for read-only endpoints (weather/intelligence)
          if (
            response &&
            response.status === 200 &&
            (url.pathname.includes("/weather") || url.pathname.includes("/intelligence"))
          ) {
            const clone = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cachedData = await caches.match(request);
          if (cachedData) return cachedData;
          return new Response(
            JSON.stringify({
              offline: true,
              message: "Network unavailable. Using local offline resilience layer.",
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          );
        })
    );
    return;
  }

  // Default: Network with Cache Fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
