// Service Worker Constants
const CACHE_NAME = "portfelik-v1";
const CACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/masked-icon.svg",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

// Firebase API Base URLs
const LOCAL_API_BASE = "http://localhost:5001/portfelik-888dd/us-central1";
const PROD_API_BASE = "https://us-central1-portfelik-888dd.cloudfunctions.net";
const API_BASE_URL = self.location.hostname === "localhost" ? LOCAL_API_BASE : PROD_API_BASE;

// Firebase URL patterns to exclude from cache handling
const FIREBASE_URL_PATTERNS = [
  "google.firestore.v1.Firestore",
  "firebaseapp.com",
  "cloudfunctions.net",
  "localhost:5001",
];

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

/**
 * Install event - caches static assets
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CACHE_URLS))
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
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

/**
 * Fetch event - serves cached content if available, otherwise fetches from the network
 */
self.addEventListener("fetch", (event) => {
  const requestUrl = event.request.url;

  // Skip Firebase-related requests
  if (FIREBASE_URL_PATTERNS.some((pattern) => requestUrl.includes(pattern))) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    }).catch((error) => console.error("[Service Worker] Fetch error:", error))
  );
});

/**
 * Push Notification event - handles push messages
 */
self.addEventListener("push", (event) => {
  console.log("[Service Worker] Push received:", event.data?.text());

  let payload;
  try {
    payload = event.data?.json();
  } catch (e) {
    payload = { notification: DEFAULT_NOTIFICATION };
  }

  const notificationOptions = {
    body: payload.notification.body || DEFAULT_NOTIFICATION.body,
    icon: DEFAULT_NOTIFICATION.icon,
    badge: DEFAULT_NOTIFICATION.badge,
    vibrate: DEFAULT_NOTIFICATION.vibrate,
    data: payload.data || {},
    actions: DEFAULT_NOTIFICATION.actions,
  };

  event.waitUntil(
    self.registration.showNotification(
      payload.notification.title || DEFAULT_NOTIFICATION.title,
      notificationOptions
    )
      .then(() => console.log("[Service Worker] Notification shown"))
      .catch((error) => console.error("[Service Worker] Error showing notification:", error))
  );
});

/**
 * Notification click event - handles user actions on notifications
 */
self.addEventListener("notificationclick", (event) => {
  console.log("[Service Worker] Notification click received:", event.action);
  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"));
  }
});

/**
 * Background Sync event - syncs transactions when connectivity is restored
 */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-transactions") {
    event.waitUntil(syncTransactions());
  }
});

/**
 * Sync Transactions - sends data to the server
 */
async function syncTransactions() {
  try {
    const response = await fetch(`${API_BASE_URL}/sendTransactionSummaryManual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error("Failed to sync transactions");
    }
  } catch (error) {
    console.error("[Service Worker] Error syncing transactions:", error);
  }
}
