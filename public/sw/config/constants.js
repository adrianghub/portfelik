export const CACHE_NAMES = {
  STATIC: "portfelik-static-v1",
  DYNAMIC: "portfelik-dynamic-v1",
};

export const API_BASE_URLS = {
  LOCAL: "http://localhost:5001/portfelik-888dd/us-central1",
  PROD: "https://us-central1-portfelik-888dd.cloudfunctions.net",
};

// Firebase URL patterns to exclude from cache handling
export const FIREBASE_URL_PATTERNS = [
  "google.firestore.v1.Firestore",
  "firebaseapp.com",
  "identitytoolkit.googleapis.com",
  "cloudfunctions.net",
  "localhost:5001",
  "localhost:8080",
  "localhost:9099",
];

// Notification Defaults
export const DEFAULT_NOTIFICATION = {
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
export const CACHE_STRATEGIES = {
  STATIC: "static", // Cache first, then network
  DYNAMIC: "dynamic", // Network first, then cache
  STATIC_ONLY: "static-only", // Cache only
};