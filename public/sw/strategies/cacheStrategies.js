import { CACHE_NAMES } from '../config/constants.js';

/**
 * Cache first strategy - tries cache first, then network
 */
export async function cacheFirst(request) {
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
    console.error("[Service Worker] Cache first strategy failed:", error);
    return new Response("Offline", { status: 503 });
  }
}

/**
 * Network first strategy - tries network first, then cache
 */
export async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAMES.DYNAMIC);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response("Offline", { status: 503 });
  }
}

/**
 * Static only strategy - only uses cache
 */
export async function staticOnly(request) {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  return new Response("Offline", { status: 503 });
}