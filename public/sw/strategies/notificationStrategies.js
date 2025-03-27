import { DEFAULT_NOTIFICATION } from '../config/constants.js';

/**
 * Shows a notification from a message event
 */
export function handleShowNotification(payload) {
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
export function handlePushEvent(event) {
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
export function handleNotificationClick(event) {
  console.log("[Service Worker] Notification click received:", event.action);
  event.notification.close();

  if (event.action === "explore") {
    return event.waitUntil(clients.openWindow("/"));
  }
}