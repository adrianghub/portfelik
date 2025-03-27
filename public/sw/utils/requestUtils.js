import { CACHE_STRATEGIES, FIREBASE_URL_PATTERNS } from '../config/constants.js';

/**
 * Determines the caching strategy for a request
 */
export function getCacheStrategy(request) {
  const url = new URL(request.url);

  // Skip Firebase-related requests as they are handled by Firebase's built-in offline persistence
  if (FIREBASE_URL_PATTERNS.some((pattern) => url.href.includes(pattern))) {
    console.debug("[Service Worker] Skipping cache for Firebase request:", url.href);
    return null;
  }

  // Static assets (images, CSS, JS)
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
  ) {
    return CACHE_STRATEGIES.STATIC;
  }

  // API requests
  if (url.pathname.startsWith("/api/")) {
    return CACHE_STRATEGIES.DYNAMIC;
  }

  // Default to static strategy for other requests
  return CACHE_STRATEGIES.STATIC;
}