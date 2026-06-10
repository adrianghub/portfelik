const CACHE_NAME = 'portfelik-20260608';

const APP_SHELL = ['/', '/transactions', '/import', '/plans', '/settings'];

const DEFAULT_ICON = '/icon-192x192.png';

/** Must match notification-sync.ts */
const NOTIFICATION_SYNC_CHANNEL = 'portfelik-notifications';
const SW_NOTIFICATION_MESSAGE_TYPE = 'portfelik:notification';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return;
	if (!/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$/.test(url.pathname)) return;

	event.respondWith(
		caches.match(event.request).then((cached) => cached ?? fetch(event.request))
	);
});

async function hasFocusedClient() {
	const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
	// A visible-but-unfocused client (browser in background, covered PWA window) cannot show
	// the in-app toast (it requires document.hasFocus()), so only a focused client suppresses
	// the system notification.
	return windowClients.some((client) => client.focused);
}

function broadcastInvalidate() {
	try {
		const channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
		channel.postMessage({ type: 'invalidate' });
		channel.close();
	} catch {
		// BroadcastChannel unavailable in some SW contexts — postMessage still runs.
	}
}

function notifyOpenClients(payload) {
	return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
		for (const client of windowClients) {
			client.postMessage({
				type: SW_NOTIFICATION_MESSAGE_TYPE,
				payload: {
					title: payload.title,
					body: payload.body,
					notificationId: payload.notificationId
				}
			});
		}
	});
}

self.addEventListener('push', (event) => {
	let payload = { title: 'Portfelik', body: '', data: {} };
	try {
		payload = event.data?.json() ?? payload;
	} catch {
		payload.body = event.data?.text() ?? '';
	}

	const data = payload.data ?? {};
	const notificationId = data.notificationId ?? data.type ?? 'portfelik';

	event.waitUntil(
		hasFocusedClient().then((focused) => {
			broadcastInvalidate();
			if (focused) {
				return notifyOpenClients({
					title: payload.title,
					body: payload.body,
					notificationId
				});
			}

			return self.registration.showNotification(payload.title, {
				body: payload.body,
				icon: DEFAULT_ICON,
				badge: DEFAULT_ICON,
				tag: notificationId,
				renotify: false,
				vibrate: [100, 50, 100],
				data,
				actions: [{ action: 'open', title: 'Otwórz' }]
			});
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data ?? {};
	let url = '/';
	if (data.transactionId) url = `/transactions?txId=${data.transactionId}`;
	else if (data.type === 'group_invitation') url = '/settings?tab=groups';
	else if (data.type === 'bank_import_reminder') url = '/import';

	event.waitUntil(
		clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((windowClients) => {
				const existing = windowClients.find((c) => c.url.includes(self.location.origin));
				if (existing) {
					existing.focus();
					existing.navigate(url);
				} else {
					clients.openWindow(url);
				}
			})
	);
});
