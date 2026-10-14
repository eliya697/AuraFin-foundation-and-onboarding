/*
 * AuraFin service worker.
 *
 * Served from the app's base path (e.g. /AuraFin-foundation-and-onboarding/sw.js on GitHub Pages),
 * so its scope is exactly the app. Strategies:
 *   - Page navigations: network-first, falling back to the cached app shell when offline.
 *   - Hashed build assets (/assets/*), icons, manifest: cache-first (file names change every build).
 *   - Google Fonts: stale-while-revalidate.
 *   - Everything else — the API (/api/*), the GitHub OTA update check, non-GET requests — always
 *     goes to the network untouched, so update detection and live data are never stale.
 *
 * Bump CACHE_VERSION whenever this file's caching behaviour changes.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `aurafin-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `aurafin-assets-${CACHE_VERSION}`;
const FONT_CACHE = `aurafin-fonts-${CACHE_VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];
const MAX_ASSET_ENTRIES = 80;

const SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL('./', SCOPE).href;
const PRECACHE = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.svg'].map(
  (path) => new URL(path, SCOPE).href,
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('aurafin-') && !KNOWN_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    // Offline: serve the last known app shell. The app itself handles offline mode from there.
    const cached = (await caches.match(SHELL_URL)) || (await caches.match(request));
    return cached || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (cacheName === ASSET_CACHE) trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // Opaque cross-origin font files report status 0 but are still cacheable.
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Only handle our own origin and scope; never touch the API or third-party calls (e.g. GitHub OTA check).
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.startsWith(`${SCOPE.pathname}api/`)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const relative = url.pathname.slice(SCOPE.pathname.length);
  if (relative.startsWith('assets/') || relative.startsWith('icons/') || relative === 'manifest.webmanifest') {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
