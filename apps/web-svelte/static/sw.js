const CACHE_NAME = 'portfelik-20260430';

const APP_SHELL = ['/', '/transactions', '/shopping-lists', '/settings'];

const DEFAULT_ICON = '/icon-192x192.png';

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

self.addEventListener('push', (event) => {
	let payload = { title: 'Portfelik', body: '' };
	try {
		payload = event.data?.json() ?? payload;
	} catch {
		payload.body = event.data?.text() ?? '';
	}

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: DEFAULT_ICON,
			badge: DEFAULT_ICON,
			vibrate: [100, 50, 100],
			data: payload.data ?? {},
			actions: [{ action: 'open', title: 'Otwórz' }]
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const data = event.notification.data ?? {};
	const url = data.type === 'group_invitation' ? '/settings?tab=groups' : '/';

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
