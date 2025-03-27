// This line is required for vite-plugin-pwa using injectManifest strategy
// It will be replaced by the generated precache manifest during build
self.__WB_MANIFEST;

import { CACHE_NAMES, CACHE_STRATEGIES } from './sw/config/constants.js';
import { cacheFirst, networkFirst, staticOnly } from './sw/strategies/cacheStrategies.js';
import { handleNotificationClick, handlePushEvent, handleShowNotification } from './sw/strategies/notificationStrategies.js';
import { getCacheStrategy } from './sw/utils/requestUtils.js';

// Message event handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    handleShowNotification(event.data.payload);
  }
});

/**
 * Install event - caches static assets
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAMES.STATIC).then((cache) => {
        return cache.addAll(self.__WB_MANIFEST);
      }),
      caches.open(CACHE_NAMES.DYNAMIC),
    ])
      .then(() => self.skipWaiting())
      .catch((error) => console.error("[Service Worker] Caching failed:", error))
  );
});

/**
 * Activate event - cleans up old caches
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName !== CACHE_NAMES.STATIC && cacheName !== CACHE_NAMES.DYNAMIC
          )
          .map((cacheName) => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

/**
 * Fetch event - handles different caching strategies
 */
self.addEventListener("fetch", (event) => {
  const strategy = getCacheStrategy(event.request);

  if (!strategy) {
    return; // Skip Firebase-related requests
  }

  event.respondWith(
    (async () => {
      switch (strategy) {
        case CACHE_STRATEGIES.STATIC:
          return cacheFirst(event.request);
        case CACHE_STRATEGIES.DYNAMIC:
          return networkFirst(event.request);
        case CACHE_STRATEGIES.STATIC_ONLY:
          return staticOnly(event.request);
        default:
          return fetch(event.request);
      }
    })()
  );
});

/**
 * Push Notification event - handles push messages
 */
self.addEventListener("push", handlePushEvent);

/**
 * Notification click event - handles user actions on notifications
 */
self.addEventListener("notificationclick", handleNotificationClick);