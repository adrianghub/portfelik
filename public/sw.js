// This line is required for vite-plugin-pwa using injectManifest strategy
// It will be replaced by the generated precache manifest during build
self.__WB_MANIFEST;

// =====================================================================
// CONSTANTS (FROM constants.js)
// =====================================================================

const CACHE_NAMES = {
  STATIC: "portfelik-static-v1",
  DYNAMIC: "portfelik-dynamic-v1",
};

const API_BASE_URLS = {
  LOCAL: "http://localhost:5001/portfelik-888dd/europe-central2",
  PROD: "https://europe-central2-portfelik-888dd.cloudfunctions.net",
};

// Define safe-to-cache patterns instead of listing patterns to exclude
const CACHEABLE_PATTERNS = {
  // Static assets file extensions
  STATIC_ASSETS: /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/,
  // HTML pages (excluding admin routes)
  HTML_PAGES: /\/$|\/index\.html$/,
  // Public API paths (if applicable)
  PUBLIC_API: /\/api\/public\//
};

// Notification Defaults
const DEFAULT_NOTIFICATION = {
  title: "Portfelik Notification",
  body: "No message content",
  icon: "/icon-192x192.png",
  badge: "/icon-192x192.png",
  vibrate: [100, 50, 100],
  actions: [
    { action: "explore", title: "View Details", icon: "/icon-192x192.png" },
    { action: "close", title: "Close", icon: "/icon-192x192.png" },
  ],
};

// Cache strategies
const CACHE_STRATEGIES = {
  STATIC: "static", // Cache first, then network
  DYNAMIC: "dynamic", // Network first, then cache
  STATIC_ONLY: "static-only", // Cache only
};

// =====================================================================
// CACHE STRATEGIES (FROM cacheStrategies.js)
// =====================================================================

/**
 * Cache-first strategy
 * Tries to get the response from cache first, falls back to network
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Cache-first strategy failed:', error);
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * Network-first strategy
 * Tries to get the response from network first, falls back to cache
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Network-first strategy failed:', error);
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * Static-only strategy
 * Only uses cached responses
 */
async function staticOnly(request) {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
  });
}

// =====================================================================
// REQUEST UTILS (FROM requestUtils.js)
// =====================================================================

/**
 * Determines if a request should be cached and with what strategy
 * Only returns a strategy for requests we explicitly want to cache
 */
function getCacheStrategy(request) {
  const url = new URL(request.url);

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) {
    return null;
  }

  // Handle static assets - use static caching for these
  if (CACHEABLE_PATTERNS.STATIC_ASSETS.test(url.pathname)) {
    console.debug("[Service Worker] Caching static asset:", url.pathname);
    return CACHE_STRATEGIES.STATIC;
  }

  // Handle HTML pages - use dynamic caching for these
  if (CACHEABLE_PATTERNS.HTML_PAGES.test(url.pathname)) {
    console.debug("[Service Worker] Caching HTML page:", url.pathname);
    return CACHE_STRATEGIES.DYNAMIC;
  }

  // Handle public API paths if applicable
  if (CACHEABLE_PATTERNS.PUBLIC_API.test(url.pathname)) {
    console.debug("[Service Worker] Caching public API request:", url.pathname);
    return CACHE_STRATEGIES.DYNAMIC;
  }

  // By default, don't cache
  return null;
}

// =====================================================================
// NOTIFICATION STRATEGIES (FROM notificationStrategies.js)
// =====================================================================

/**
 * Shows a notification from a message event
 */
function handleShowNotification(payload) {
  console.log('[Service Worker] Received notification request:', payload);

  const title = payload.notification?.title || DEFAULT_NOTIFICATION.title;
  const options = {
    body: payload.notification?.body || DEFAULT_NOTIFICATION.body,
    icon: DEFAULT_NOTIFICATION.icon,
    badge: DEFAULT_NOTIFICATION.badge,
    vibrate: DEFAULT_NOTIFICATION.vibrate,
    data: payload.data || {},
    actions: DEFAULT_NOTIFICATION.actions,
  };

  return self.registration.showNotification(title, options)
    .then(() => console.log('[Service Worker] Notification shown successfully'))
    .catch(error => console.error('[Service Worker] Error showing notification:', error));
}

/**
 * Handles push notification events
 */
function handlePushEvent(event) {
  console.log("[Service Worker] Push received:", event.data?.text());

  let payload;
  try {
    payload = event.data?.json();
  } catch (e) {
    payload = { notification: DEFAULT_NOTIFICATION };
  }

  const notificationOptions = {
    body: payload.notification?.body || DEFAULT_NOTIFICATION.body,
    icon: DEFAULT_NOTIFICATION.icon,
    badge: DEFAULT_NOTIFICATION.badge,
    vibrate: DEFAULT_NOTIFICATION.vibrate,
    data: payload.data || {},
    actions: DEFAULT_NOTIFICATION.actions,
  };

  return event.waitUntil(
    self.registration.showNotification(
      payload.notification?.title || DEFAULT_NOTIFICATION.title,
      notificationOptions
    )
      .then(() => console.log("[Service Worker] Notification shown"))
      .catch((error) => console.error("[Service Worker] Error showing notification:", error))
  );
}

/**
 * Handles notification click events
 */
function handleNotificationClick(event) {
  console.log("[Service Worker] Notification click received:", event.notification);

  // Get the notification data
  const data = event.notification.data || {};

  // Close the notification
  event.notification.close();

  // Handle different notification types
  if (data.type === "group_invitation") {
    console.log("[Service Worker] Group invitation notification clicked");

    // Use the link from data or fallback to the settings page with invitations tab
    const link = data.link || "/settings?tab=groups&subtab=invitations";

    return event.waitUntil(
      clients.openWindow(link)
        .then(() => console.log("[Service Worker] Opened window to:", link))
        .catch(error => console.error("[Service Worker] Error opening window:", error))
    );
  }

  // Default action if no specific handler is defined
  if (event.action === "explore") {
    return event.waitUntil(clients.openWindow("/"));
  }

  // If no specific action, open the root of the app
  return event.waitUntil(clients.openWindow("/"));
}

// =====================================================================
// SERVICE WORKER EVENTS
// =====================================================================

// Message event handler
self.addEventListener('message', (event) => {
  console.log("[Service Worker] Message received:", event.data);
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    handleShowNotification(event.data.payload);
  }
});

/**
 * Install event - caches static assets
 */
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing");
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAMES.STATIC).then((cache) => {
        console.log("[Service Worker] Caching static assets");
        return cache.addAll(self.__WB_MANIFEST || []);
      }),
      caches.open(CACHE_NAMES.DYNAMIC),
    ])
      .then(() => {
        console.log("[Service Worker] Installed successfully");
        return self.skipWaiting();
      })
      .catch((error) => console.error("[Service Worker] Installation failed:", error))
  );
});

/**
 * Activate event - cleans up old caches
 */
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating");
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
    ).then(() => {
      console.log("[Service Worker] Activated successfully");
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - handles different caching strategies
 */
self.addEventListener("fetch", (event) => {
  // Get caching strategy - only returns a strategy for requests we explicitly want to cache
  const strategy = getCacheStrategy(event.request);

  // If no strategy is returned, don't handle this request (pass through to browser)
  if (!strategy) {
    return;
  }

  // Handle the request with the appropriate caching strategy
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
self.addEventListener("push", (event) => {
  console.log("[Service Worker] Push event received");
  handlePushEvent(event);
});

/**
 * Notification click event - handles user actions on notifications
 */
self.addEventListener("notificationclick", (event) => {
  console.log("[Service Worker] Notification click event received");
  handleNotificationClick(event);
});